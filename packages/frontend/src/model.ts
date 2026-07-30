import { Schema as S } from 'effect'

export const Model = S.Struct({
  count: S.Number,
})
export interface Model extends S.Schema.Type<typeof Model> {}

export function initialModel(): Model {
  return { count: 0 }
}

export const Message = S.Union([
  S.Struct({ _tag: S.Literal('Increment') }),
  S.Struct({ _tag: S.Literal('Decrement') }),
])
export type Message = S.Schema.Type<typeof Message>
