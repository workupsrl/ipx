import { IncomingMessage, ServerResponse } from 'http';

interface SourceData {
    mtime?: Date;
    maxAge?: number;
    getData: () => Promise<Buffer>;
}
declare type Source = (src: string, reqOptions?: any) => Promise<SourceData>;
declare type SourceFactory<T = Record<string, any>> = (options: T) => Source;

interface ImageMeta {
    width: number;
    height: number;
    type: string;
    mimeType: string;
}
interface IPXCTX {
    sources: Record<string, Source>;
}
interface IPXImageData {
    src: () => Promise<SourceData>;
    data: () => Promise<{
        data: Buffer;
        meta: ImageMeta;
        format: string;
    }>;
}
declare type IPX = (id: string, modifiers?: Record<string, string>, reqOptions?: any) => IPXImageData;
interface IPXOptions {
    dir?: false | string;
    maxAge?: number;
    domains?: false | string[];
    alias: Record<string, string>;
    fetchOptions: RequestInit;
    sharp?: {
        [key: string]: any;
    };
}
declare function createIPX(userOptions: Partial<IPXOptions>): IPX;

interface IPXCache {
    element: IPXImageData;
    timestamp: Date;
    expiry: number;
}
interface IPXHRequest {
    url: string;
    headers?: Record<string, string>;
    options?: any;
}
interface IPXHResponse {
    statusCode: number;
    statusMessage: string;
    headers: Record<string, string>;
    body: any;
}
declare function handleRequest(req: IPXHRequest, ipx: IPX): Promise<IPXHResponse>;
declare function createIPXMiddleware(ipx: IPX): (req: IncomingMessage, res: ServerResponse) => Promise<void>;

export { IPX, IPXCTX, IPXCache, IPXHRequest, IPXHResponse, IPXImageData, IPXOptions, ImageMeta, Source, SourceData, SourceFactory, createIPX, createIPXMiddleware, handleRequest };
