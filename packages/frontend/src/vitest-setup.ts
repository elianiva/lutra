import 'happy-dom'

// happy-dom provides ImageBitmap but it's an abstract class that throws on
// construction ("Illegal constructor"). The engine message schemas use
// Schema.instanceOf(ImageBitmap) in their field definitions, so we need a
// concrete one available at module-import time.
//
// `implements ImageBitmap` keeps the class structurally assignable to the
// DOM `ImageBitmap` interface, so it can stand in as the global constructor
// and be constructed directly in tests without type assertions.
export class MockImageBitmap implements ImageBitmap {
  width: number
  height: number
  // Optional params keep the constructor callable as the DOM `new ()`
  // signature while still letting tests construct a sized bitmap.
  constructor(width = 0, height = 0) {
    this.width = width
    this.height = height
  }
  close() {}
}
globalThis.ImageBitmap = MockImageBitmap
