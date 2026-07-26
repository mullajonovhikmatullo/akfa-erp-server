export type SaveFileInput = {
    storageKey: string;
    content: Buffer;
};

export type StoredFile = {
    storageKey: string;
    sizeBytes: number;
};

export interface FileStorageService {
    save(input: SaveFileInput): Promise<StoredFile>;
    delete(storageKey: string): Promise<void>;
    exists(storageKey: string): Promise<boolean>;
    read(storageKey: string): Promise<Buffer>;
    getPublicUrl(storageKey: string): string;
}
