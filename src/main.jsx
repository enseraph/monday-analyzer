import { createRoot } from 'react-dom/client'
import { Component } from 'react'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import './grid.css'
import './print.css'
import App from './App.jsx'

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) return (
      <div style={{padding:40,fontFamily:'monospace',color:'#ef4444',background:'#080e1a',minHeight:'100vh'}}>
        <h2>Dashboard Error</h2>
        <pre style={{whiteSpace:'pre-wrap',fontSize:12}}>{this.state.error.message}</pre>
        <pre style={{whiteSpace:'pre-wrap',fontSize:10,color:'#888',marginTop:10}}>{this.state.error.stack}</pre>
        <button onClick={()=>{localStorage.clear();window.location.reload()}} style={{marginTop:20,padding:'8px 16px',cursor:'pointer'}}>Clear Cache & Reload</button>
      </div>
    )
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(<ErrorBoundary><App /></ErrorBoundary>)
