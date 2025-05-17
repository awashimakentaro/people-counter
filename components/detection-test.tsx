"use client"

import { useEffect, useRef, useState } from "react"
import * as cocossd from "@tensorflow-models/coco-ssd"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function DetectionTest() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [model, setModel] = useState<cocossd.ObjectDetection | null>(null)
  const [detections, setDetections] = useState<string[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modelLoaded, setModelLoaded] = useState(false)

  // モデルの読み込み
  useEffect(() => {
    async function loadModel() {
      try {
        console.log("モデルを読み込み中...")
        const loadedModel = await cocossd.load({
          base: "lite_mobilenet_v2",
        })
        console.log("モデルの読み込み成功:", loadedModel)
        setModel(loadedModel)
        setModelLoaded(true)
      } catch (error) {
        console.error("モデルの読み込みエラー:", error)
        setError(`モデルの読み込みエラー: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    loadModel()
  }, [])

  // カメラの設定
  const setupCamera = async () => {
    try {
      setError(null)
      console.log("カメラへのアクセスを要求中...")

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("お使いのブラウザはカメラをサポートしていません。")
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false,
      })

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        console.log("カメラの準備完了")
      }
    } catch (error) {
      console.error("カメラエラー:", error)
      setError(`カメラエラー: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // 検出の開始/停止
  const toggleDetection = async () => {
    if (isRunning) {
      setIsRunning(false)
      return
    }

    if (!videoRef.current?.srcObject) {
      await setupCamera()
    }

    setIsRunning(true)
    detectFrame()
  }

  // フレームごとの検出
  const detectFrame = async () => {
    if (!isRunning || !model || !videoRef.current) return

    try {
      const predictions = await model.detect(videoRef.current)
      console.log("検出結果:", predictions)

      const detectionTexts = predictions.map((pred) => `${pred.class} (${Math.round(pred.score * 100)}%)`)

      setDetections(detectionTexts)

      requestAnimationFrame(detectFrame)
    } catch (error) {
      console.error("検出エラー:", error)
      setError(`検出エラー: ${error instanceof Error ? error.message : String(error)}`)
      setIsRunning(false)
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>検出テスト</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            <p>{error}</p>
          </div>
        )}

        <div className="mb-4">
          <p>モデルの状態: {modelLoaded ? "読み込み完了" : "読み込み中..."}</p>
        </div>

        <div className="relative mb-4">
          <video ref={videoRef} className="w-full rounded-lg" autoPlay playsInline muted />
        </div>

        <Button onClick={toggleDetection} disabled={!modelLoaded}>
          {isRunning ? "停止" : "検出開始"}
        </Button>

        <div className="mt-4">
          <h3 className="font-medium mb-2">検出結果:</h3>
          {detections.length === 0 ? (
            <p>何も検出されていません</p>
          ) : (
            <ul className="list-disc pl-5">
              {detections.map((detection, index) => (
                <li key={index}>{detection}</li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
