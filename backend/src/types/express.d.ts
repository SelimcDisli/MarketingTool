// Fix Express v5 params typing
import 'express';

declare module 'express' {
  interface Request {
    params: Record<string, string>;
  }
}
