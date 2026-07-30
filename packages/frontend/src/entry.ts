import { Runtime } from 'foldkit'
import { overlay as devToolsOverlay } from '@foldkit/devtools'
import type { Message } from './model'
import { Model, init, update, view } from './main'

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

const application = Runtime.makeApplication({
  Model,
  update,
  view,
  container: root,
  devTools: { overlay: devToolsOverlay },
  // oxlint-disable-next-line typescript/consistent-type-assertions
  init: init as Runtime.ApplicationInit<typeof Model.Type, Message>,
})

Runtime.run(application)
