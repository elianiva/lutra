import { Match } from 'effect'
import { Command } from 'foldkit'
import type { Model, Message } from './model'

const NO_CMDS: ReadonlyArray<Command.Command<Message>> = []
type Result = readonly [Model, ReadonlyArray<Command.Command<Message>>]

export const update = (model: Model, message: Message): Result =>
  Match.valueTags(message, {
    // oxlint-disable-next-line typescript/no-misused-spread
    Increment: (): Result => [{ ...model, count: model.count + 1 }, NO_CMDS],
    // oxlint-disable-next-line typescript/no-misused-spread
    Decrement: (): Result => [{ ...model, count: model.count - 1 }, NO_CMDS],
  })
