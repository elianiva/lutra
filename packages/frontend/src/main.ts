import { Model, Message, initialModel } from './model'

export { Model, Message, initialModel }

import { update } from './update'
export { update }

import { view } from './view'
export { view }

export const init = () => {
  return [initialModel(), []] as const
}
