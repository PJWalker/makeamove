import { render } from 'preact'
import './styles/base.css'
import './styles/tokens.css'
import './styles/components.css'
import './styles/layout.css'
import './styles/transitions.css'
import { App } from './app'

render(<App />, document.getElementById('app')!)
