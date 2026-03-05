import { useEffect } from 'react'
import { Sidebar } from '#components/features/sidebar/Sidebar'
import { Header } from '#components/features/layout/Header'
import { ChatPanel } from '#components/features/chat/ChatPanel'
import { ChatInput } from '#components/features/chat/ChatInput'
import { Toaster } from 'sonner'
import { useInvestigationStore } from '#stores/investigation-store'

export default function App() {
  useEffect(() => { void useInvestigationStore.getState().hydrate() }, [])
  return (
    <div className="flex h-screen overflow-hidden bg-bg-primary text-text-primary">
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
            background: '#111113',
            border: '1px solid #27272A',
            color: '#FAFAFA',
          },
        }}
      />
    </div>
  )
}
