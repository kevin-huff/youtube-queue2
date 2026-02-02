import { TextEncoder, TextDecoder } from 'util';
import '@testing-library/jest-dom';

// jsdom doesn't include TextEncoder/Decoder by default
if (!global.TextEncoder) {
  global.TextEncoder = TextEncoder;
}

// Basic stream polyfills for libraries that expect them
try {
  const {
    TransformStream,
    ReadableStream,
    WritableStream
  } = require('stream/web');
  if (!global.TransformStream) {
    global.TransformStream = TransformStream;
  }
  if (!global.ReadableStream) {
    global.ReadableStream = ReadableStream;
  }
  if (!global.WritableStream) {
    global.WritableStream = WritableStream;
  }
} catch (_) {}

if (!global.TextDecoder) {
  global.TextDecoder = TextDecoder;
}
