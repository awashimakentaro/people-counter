"use client"
import PeopleCounter from "../components/people-counter"

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-4">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm">
        <h1 className="text-2xl font-bold text-center mb-4">人数カウントシステム</h1>
        <PeopleCounter />
      </div>
    </main>
  )
}