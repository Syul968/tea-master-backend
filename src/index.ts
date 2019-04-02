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
import { ApolloServer, ApolloError, ValidationError, gql } from 'apollo-server';
import { User } from './models/user';
import { Tea } from './models/tea';
import { Brew } from './models/brew';

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
        userTeas(id: ID!): [Tea!]!
        teaBrews(id: ID!): [Brew!]!
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
        async userTeas(_: null, args: { id: String }) {
            const userDoc = await admin
            .firestore()
            .collection('user')
            .doc(args.id.toString())
            .get();

            const user = userDoc.data() as User;
            if(!user)
                return new ValidationError('User ID not found');

            const teas = await admin
            .firestore()
            .collection('teas')
            .where('userId', '==', args.id)
            .get();

            return teas.docs.map( tea => tea.data() ) as Tea[];
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
    }
};

/**
 * Apollo Server
 */
const server = new ApolloServer({
    typeDefs,
    resolvers,
    introspection: true
});

server.listen({port: process.env.PORT || 4000}).then(({url}) => {
    console.log(`Server ready at ${url}`);
});