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
import { Tea, Type } from './models/tea';
import { Brew } from './models/brew';
const random = require('random');

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
        rating: Float!
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
        signup(id: String!, password: String!, email: String!, picture: String): String
        postTea(brand: String!, name: String!, type: String!, isPublic: Boolean): Tea!
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
    
                var teas = [];
                
                return admin
                .firestore()
                .collection('teas')
                .where('userId', '==', userId)
                .get().then(snapshot => {
                    if(snapshot.empty) {
                        console.log("No teas for this user");
                        return;
                    }
                    
                    snapshot.forEach(doc => {
                        var tea = doc.data() as Tea;
                        tea.id = doc.id;
                        teas.push(tea);
                    });

                    return teas;
                });
    
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
            
            // const salt = userDoc.data().salt;
            const dbHash = userDoc.data().password;
            // console.log(`salt from firebase: ${salt}`);
            
            return bcrypt.compare(args.password, dbHash).then((res) => {
                if(res) {
                    console.log('Logged in succesfully!');
                    const token = jwt.sign({
                        user: args.id,
                    }, authConfig.secret, signingOptions);
                    
                    return token as String;
                } else {
                    return console.log('Verify your credentials');
                }
            });
        },
        async signup(_:null, args: {id: string, password: string, email: string, picture: string}, context: { userId }) {
            try {
                const userId = await context.userId;
                if(userId) {
                    console.log('Already logged in');
                    return new AuthenticationError('Already logged in');
                }
            } catch(e) {
                throw new AuthenticationError('Login auth error');
            }

            const userDoc = await admin
            .firestore()
            .collection('users')
            .doc(args.id)
            .get();

            if(userDoc.exists) {
                console.log('User already exists');
                console.log(userDoc.data());
                return new ValidationError('User already exists');
            }

            const hash = await bcrypt.hash(args.password, random.int(5, 20));
            console.log(`HASH: ${hash}`);

            var user = {
                email: args.email,
                password: hash,
            };

            if(args.picture) {
                user['picture'] = args.picture;
            }

            await admin.firestore().collection('users').doc(args.id).set(user);

            const token = await jwt.sign({
                user: args.id,
            }, authConfig.secret, signingOptions);
            
            return token as String;
        },
        async postTea(_:null, args: { brand: String, name: String, type: String, isPublic: Boolean }, context: { userId }) {
            
            try {
                const userId = await context.userId;
                if(!userId) {
                    return console.log('Cannot post anonymous user tea');
                }

                const userDoc = await admin
                .firestore()
                .collection('users')
                .doc(userId)
                .get();
    
                if(!userDoc)
                    return new AuthenticationError('User ID not found');
    
                const brand = args.brand;
                const name = args.name;
                const type = args.type;
                const isPublic = args.isPublic || false;
    
                switch(type) {
                    case Type.BLACK:
                    case Type.GREEN:
                    case Type.WHITE:
                    case Type.TISANE:
                    case Type.OTHER:
                        break;
                    default:
                        return new ValidationError('Invalid tea type');
                }
    
                const tea = {
                    userId: userId,
                    brand: brand,
                    name: name,
                    type: type,
                    isPublic: isPublic,
                    rating: 0.0
                }
    
                const teaRef = await admin.firestore().collection('teas').add(tea)
                
                const responseTea = await admin
                .firestore()
                .collection('teas')
                .doc(teaRef.id)
                .get();
                
                const response = {
                    id: teaRef.id,
                    brand: responseTea.data().brand,
                    name: responseTea.data().name,
                    type: responseTea.data().type,
                    rating: 0,
                    isPublic: responseTea.data().isPublic,
                    userId: responseTea.data().userId
                } as Tea;

                console.log(response);
                return response;
            } catch(e) {
                throw new AuthenticationError('You are not logged in');
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
