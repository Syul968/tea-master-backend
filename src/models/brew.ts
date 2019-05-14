import { Timestamp } from "@google-cloud/firestore";

export interface Brew {
    id: string,
    timestamp: Timestamp,
    temperature: number,
    dose: number,
    time: number,
    rating: number,
    notes: string,
    teaId: string
}
