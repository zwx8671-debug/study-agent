/** @format */

/**
 * uWebSockets.js 类型定义扩展
 */

declare module 'uWebSockets.js' {
    export interface HttpRequest {
        getMethod(): string
        getUrl(): string
        getQuery(): string
        getHeader(key: string): string
        forEach(callback: (key: string, value: string) => void): void
    }

    export interface HttpResponse {
        writeStatus(status: string): HttpResponse
        writeHeader(key: string, value: string): HttpResponse
        write(chunk: ArrayBuffer | Uint8Array | string): boolean
        end(body?: ArrayBuffer | Uint8Array | string): void
        onAborted(callback: () => void): void
        onData(callback: (chunk: ArrayBuffer, isLast: boolean) => void): void
        cork(callback: () => void): void
    }

    export type us_socket_context_t = any

    export interface AppOptions {
        key_file_name?: string
        cert_file_name?: string
        passphrase?: string
        dh_params_file_name?: string
        ssl_prefer_low_memory_usage?: boolean
    }

    export interface TemplatedApp {
        get(pattern: string, handler: (res: HttpResponse, req: HttpRequest) => void): TemplatedApp
        post(pattern: string, handler: (res: HttpResponse, req: HttpRequest) => void): TemplatedApp
        put(pattern: string, handler: (res: HttpResponse, req: HttpRequest) => void): TemplatedApp
        del(pattern: string, handler: (res: HttpResponse, req: HttpRequest) => void): TemplatedApp
        patch(pattern: string, handler: (res: HttpResponse, req: HttpRequest) => void): TemplatedApp
        options(pattern: string, handler: (res: HttpResponse, req: HttpRequest) => void): TemplatedApp
        any(pattern: string, handler: (res: HttpResponse, req: HttpRequest) => void): TemplatedApp
        ws(pattern: string, options: any): TemplatedApp
        listen(host: string, port: number, callback: (listenSocket: us_socket_context_t | false) => void): TemplatedApp
        listen(port: number, callback: (listenSocket: us_socket_context_t | false) => void): TemplatedApp
    }

    export function App(options?: AppOptions): TemplatedApp
    export function SSLApp(options: AppOptions): TemplatedApp
}
