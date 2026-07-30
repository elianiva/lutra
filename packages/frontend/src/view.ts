import type { HtmlBuilder } from 'foldkit/html'
import type { Model, Message } from './model'

export function view(model: Model, h: HtmlBuilder<Message>) {
  return {
    title: 'Lutra',
    body: h.div(
      [h.Class('flex flex-col items-center justify-center min-h-screen gap-6 bg-neutral-50')],
      [
        h.h1(
          [h.Class('text-6xl font-bold tracking-tight text-neutral-900')],
          [String(model.count)],
        ),
        h.div(
          [h.Class('flex gap-3')],
          [
            h.button(
              [
                h.Class(
                  'px-5 py-2 text-lg font-medium text-white bg-neutral-800 rounded-lg hover:bg-neutral-700 transition-colors',
                ),
                h.OnClick({ _tag: 'Decrement' }),
              ],
              ['\u2212'],
            ),
            h.button(
              [
                h.Class(
                  'px-5 py-2 text-lg font-medium text-white bg-neutral-800 rounded-lg hover:bg-neutral-700 transition-colors',
                ),
                h.OnClick({ _tag: 'Increment' }),
              ],
              ['+'],
            ),
          ],
        ),
      ],
    ),
  }
}
