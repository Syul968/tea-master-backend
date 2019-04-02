enum Type {
    'Black',
    'Green',
    'White',
    'Tisane',
    'Other'
}

export interface Tea {
    id: string,
    brand: string,
    name: string,
    type: Type,
    isPublic: boolean,
    userId: string
}
