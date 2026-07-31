import 'happy-dom'

// happy-dom provides ImageBitmap but it's an abstract class that throws on
// construction ("Illegal constructor"). The engine message schemas use
// Schema.instanceOf(ImageBitmap) in their field definitions, so we need a
// concrete one available at module-import time.
class MockImageBitmap {
  width: number
  height: number
  constructor(width: number, height: number) {
    this.width = width
    this.height = height
  }
  close() {}
}
globalThis.ImageBitmap = MockImageBitmap as unknown as typeof ImageBitmap
