export enum Type {
    BLACK = 'Black',
    GREEN = 'Green',
    WHITE = 'White',
    TISANE = 'Tisane',
    OTHER = 'Other'
}

export interface Tea {
    id: string,
    brand: string,
    name: string,
    type: Type,
    isPublic: boolean,
    userId: string
}
