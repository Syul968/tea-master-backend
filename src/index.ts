/**
 * Set up the service account for Cloud Firestore
 */
import * as admin from 'firebase-admin';

const serviceAccount = require('../config/service-account.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

/**
 * Imports
 */
import { ApolloServer, ApolloError, ValidationError, gql, AuthenticationError } from 'apollo-server';
import { User } from './models/user';
import { Tea } from './models/tea';
import { Brew } from './models/brew';

/**
 * Auth imports and setup
 */
const jwt = require('jsonwebtoken');
const authConfig = require('../config/auth.json');
const options = {
    audience: authConfig.audience,
    issuer: authConfig.issuer,
    algorithms: ['HS256']
}
const signingOptions = {
    audience: authConfig.audience,
    issuer: authConfig.issuer,
    expiresIn: '1w',
    algorithm: 'HS256'
};
const bcrypt = require('bcrypt');

/**
 * Define GraphQL types
 */
const typeDefs = gql`
    type User {
        id: ID!
        email: String!
    }

    type Tea {
        id: ID!
        brand: String!
        name: String!
        type: String!
        isPublic: Boolean
        userId: ID!
    }

    type Brew {
        id: ID!
        timestamp: String!
        temperature: Int!
        dose: Float!
        time: Int!
        rating: Float!
        notes: String!
        teaId: ID!
    }

    type Query {
        publicTeas: [Tea!]!
        userTeas: [Tea!]!
        teaBrews(id: ID!): [Brew!]!
    }

    type Mutation {
        login(id: String!, password: String!): String
    }
`;

/**
 * Field resolvers
 */
const resolvers = {
    Query: {
        async publicTeas() {
            const teas = await admin
            .firestore()
            .collection('teas')
            .where('isPublic', '==', true)
            .get();

            return teas.docs.map( tea => tea.data() ) as Tea[];
        },
        async userTeas(_: null, args: null, context: { userId }) {
            try {
                const userId = await context.userId;

                const userDoc = await admin
                .firestore()
                .collection('users')
                .doc(userId.toString())
                .get();
    
                const user = userDoc.data() as User;
                if(!user)
                    return new ValidationError('User ID not found');
    
                const teas = await admin
                .firestore()
                .collection('teas')
                .where('userId', '==', userId)
                .get();
    
                return teas.docs.map( tea => tea.data() ) as Tea[];
            } catch(e) {
                throw new AuthenticationError('You are not allowed to do that');
            }

        },
        async teaBrews(_: null, args: { id: String }) {
            const teaDoc = await admin
            .firestore()
            .collection('teas')
            .doc(args.id.toString())
            .get();

            const tea = teaDoc.data() as Tea;
            if(!tea)
                return new ValidationError('Tea ID not found');

            const brews = await admin
            .firestore()
            .collection('brews')
            .where('teaId', '==', args.id)
            .get();

            return brews.docs.map(brew => brew.data()) as Brew[];
        }
    },
    Mutation: {
        async login(_: null, args: { id: String, password: String }, context: { userId }) {
            try {
                const userId = await context.userId;
                if(userId)
                    return console.log('Already logged in');
            } catch(e) {
                throw new AuthenticationError('Login auth error');
            }

            const userDoc = await admin
            .firestore()
            .collection('users')
            .doc(args.id.toString())
            .get();

            if(!userDoc)
                return new ValidationError('User ID not found');
            
            const dbHash = userDoc.data().password;
            
            try {
                bcrypt.compare(args.password, dbHash, (err, res) => {
                    if(err) {
                        console.log('>>> Failed while comparing the hashes');
                        return console.log(err);
                    }
                    
                    if(res) {
                        console.log('Logged in succesfully!');
                        jwt.sign({
                            user: args.id,
                        }, authConfig.secret, signingOptions, (err, token) => {
                            if(err) {
                                console.log('>>> Failed to issue token');
                                return console.log(err);
                            }
                            console.log(`token: ${token}`);
                            return token as String;
                        });
                    }
                    else {
                        return console.log('Verify your credentials');
                    }
                });
            } catch(e) {
                throw new AuthenticationError('Are you this user?');
            }
        }
    }
};

/**
 * Apollo Server
 */
const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: ({ req }) => {
        const token = req.headers.authorization;

        if(token) {
            const userId = new Promise((resolve, reject) => {
                jwt.verify(token, authConfig.secret, options, (err, payload) => {
                    if(err)
                        return reject(err);
                    
                    if(!payload.exp)
                        return reject('Unexpirable tokens are not allowed');
                    resolve(payload.user);
                });
            }).catch((err) => {
                console.log(`>>> ${err}`);
            });
            
            return {
                userId
            };
        } else {
            console.log('No token provided in query request');
        }
    },
    introspection: true
});

server.listen({port: process.env.PORT || 4000}).then(({url}) => {
    console.log(`Server ready at ${url}`);
});