import { Sidebar } from '#components/sidebar/Sidebar'
import { Header } from '#components/layout/Header'
import { ChatPanel } from '#components/chat/ChatPanel'
import { ChatInput } from '#components/chat/ChatInput'
import { Toaster } from 'sonner'

export default function App() {
  return (
    <div className="flex h-screen overflow-hidden bg-bg-primary">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <ChatPanel />
        <ChatInput />
      </div>
      <Toaster
        theme="dark"
        position="top-right"
        toastOptions={{
          style: {
            background: 'rgba(30, 41, 59, 0.9)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#F8FAFC',
          },
        }}
      />
    </div>
  )
}
