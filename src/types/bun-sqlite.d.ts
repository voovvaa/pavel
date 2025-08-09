// Type definitions for bun:sqlite
declare module 'bun:sqlite' {
  export class Database {
    constructor(filename: string);
    exec(sql: string): void;
    prepare(sql: string): Statement;
    run(sql: string): any;
    close(): void;
    lastInsertRowid?: number;
  }

  export interface Statement {
    run(...params: any[]): { changes: number; lastInsertRowid: number };
    get(...params: any[]): any;
    all(...params: any[]): any[];
    finalize(): void;
  }
}