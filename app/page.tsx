"use client"
// インポートパスを修正
import PeopleCounter from "@/components/people-counter"
import DetectionTest from "@/components/detection-test"
import { useState } from "react"
import { Button } from "@/components/ui/button"

export default function Home() {
  const [showTest, setShowTest] = useState(false)

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-4">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm">
        <h1 className="text-2xl font-bold text-center mb-4">人数カウントシステム</h1>

        <div className="mb-4 flex justify-center">
          <Button onClick={() => setShowTest(!showTest)}>
            {showTest ? "通常モードに戻る" : "検出テストモードに切り替え"}
          </Button>
        </div>

        {showTest ? <DetectionTest /> : <PeopleCounter />}
      </div>
    </main>
  )
}
