"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import * as cocossd from "@tensorflow-models/coco-ssd"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeftRight, Pause, Play, RotateCcw, Eye, Settings } from "lucide-react"

export default function PeopleCounter() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [model, setModel] = useState<cocossd.ObjectDetection | null>(null)
  const [count, setCount] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const [direction, setDirection] = useState(true) // true: 左から右, false: 右から左
  const [history, setHistory] = useState<{ timestamp: Date; direction: string }[]>([])
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [debugMode, setDebugMode] = useState(false)
  const [detectionInfo, setDetectionInfo] = useState<string>("")
  const [sensitivity, setSensitivity] = useState<number>(100) // デフォルトを100に変更（最大感度）
  const [threshold, setThreshold] = useState<number>(20) // 移動距離の閾値（デフォルト20ピクセル）
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [resolution, setResolution] = useState<string>("medium") // low, medium, high
  const [detectionInterval, setDetectionInterval] = useState<number>(1) // フレーム間隔（1=毎フレーム、2=1フレームおき）
  const frameCountRef = useRef(0)
  const [performanceInfo, setPerformanceInfo] = useState<string>("")
  const lastProcessTimeRef = useRef(0)

  // 検出された人物を追跡するための状態
  const detectedPeopleRef = useRef<
    Map<
      string,
      {
        id: string
        bbox: [number, number, number, number]
        lastSeen: number
        counted: boolean
        path: { x: number; y: number }[]
      }
    >
  >(new Map())

  // 一意のIDを生成する関数
  const generateId = () => Math.random().toString(36).substring(2, 9)

  // 解像度に基づくカメラ設定を取得
  const getVideoConstraints = useCallback(() => {
    switch (resolution) {
      case "low":
        return { width: 320, height: 240 }
      case "medium":
        return { width: 640, height: 480 }
      case "high":
        return { width: 1280, height: 720 }
      default:
        return { width: 640, height: 480 }
    }
  }, [resolution])

  // setupCamera関数をコンポーネントのトップレベルで定義（useCallbackを使用）
  const setupCamera = useCallback(async () => {
    try {
      console.log("カメラへのアクセスを要求中...")
      setCameraError(null)

      // カメラが利用可能か確認
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("お使いのブラウザはカメラをサポートしていません。")
      }

      const videoConstraints = getVideoConstraints()
      console.log("カメラ解像度設定:", videoConstraints)

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false,
      })

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          console.log("カメラの準備完了")
          setCameraReady(true)
        }
      }
    } catch (error) {
      console.error("カメラへのアクセスエラー:", error)
      if (error instanceof Error) {
        if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
          setCameraError("カメラへのアクセスが拒否されました。ブラウザの設定でカメラへのアクセスを許可してください。")
        } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
          setCameraError("カメラが見つかりません。カメラが接続されているか確認してください。")
        } else if (error.name === "NotReadableError" || error.name === "TrackStartError") {
          setCameraError("カメラにアクセスできません。他のアプリケーションがカメラを使用している可能性があります。")
        } else {
          setCameraError(`カメラエラー: ${error.message}`)
        }
      } else {
        setCameraError("不明なカメラエラーが発生しました。")
      }
    }
  }, [videoRef, getVideoConstraints])

  // モデルの読み込み
  useEffect(() => {
    async function loadModel() {
      try {
        console.log("モデルを読み込み中...")
        // モデルのロード時にbaseUrlを指定して、CDNからロードする
        const loadedModel = await cocossd.load({
          base: "lite_mobilenet_v2", // より軽量なモデルを使用
        })
        setModel(loadedModel)
        console.log("モデルの読み込みが完了しました")
      } catch (error) {
        console.error("モデルの読み込みに失敗しました:", error)
        setCameraError("モデルの読み込みに失敗しました。ページを再読み込みしてください。")
      }
    }

    loadModel()

    return () => {
      // クリーンアップ
    }
  }, [])

  // カメラの初期化
  useEffect(() => {
    if (!videoRef.current) return

    setupCamera()

    return () => {
      // カメラストリームのクリーンアップ
      const stream = videoRef.current?.srcObject as MediaStream
      if (stream) {
        const tracks = stream.getTracks()
        tracks.forEach((track) => track.stop())
      }
    }
  }, [setupCamera])

  // 解像度変更時にカメラを再初期化
  useEffect(() => {
    if (cameraReady) {
      // 既存のストリームを停止
      const stream = videoRef.current?.srcObject as MediaStream
      if (stream) {
        const tracks = stream.getTracks()
        tracks.forEach((track) => track.stop())
      }

      // カメラを再初期化
      setupCamera()
    }
  }, [resolution, setupCamera, cameraReady])

  // 検出ループ
  useEffect(() => {
    let animationId: number

    async function detectPeople() {
      if (!model || !videoRef.current || !canvasRef.current || !isRunning) return

      // フレームカウントを増やし、設定された間隔でのみ処理
      frameCountRef.current = (frameCountRef.current + 1) % detectionInterval
      if (frameCountRef.current !== 0) {
        animationId = requestAnimationFrame(detectPeople)
        return
      }

      const startTime = performance.now()

      const video = videoRef.current
      const canvas = canvasRef.current
      const ctx = canvas.getContext("2d")

      if (!ctx) return

      // キャンバスのサイズをビデオに合わせる
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      // ビデオフレームをキャンバスに描画
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      // 人物検出
      try {
        const predictions = await model.detect(video)

        const endTime = performance.now()
        const processTime = endTime - startTime
        lastProcessTimeRef.current = processTime

        // パフォーマンス情報を更新
        if (debugMode) {
          setPerformanceInfo(`処理時間: ${processTime.toFixed(1)}ms`)
        }

        // デバッグ情報を更新
        if (debugMode) {
          setDetectionInfo(`検出: ${predictions.filter((p) => p.class === "person").length}人`)
        }

        // 現在の時間
        const now = Date.now()

        // 既存の追跡対象を更新
        const currentDetectedPeople = new Map(detectedPeopleRef.current)

        // 検出された人物を処理
        for (const prediction of predictions) {
          if (prediction.class === "person") {
            const bbox = prediction.bbox
            const centerX = bbox[0] + bbox[2] / 2
            const centerY = bbox[1] + bbox[3] / 2

            // 既存の追跡対象と照合
            let matched = false

            for (const [id, person] of currentDetectedPeople.entries()) {
              const personCenterX = person.bbox[0] + person.bbox[2] / 2
              const personCenterY = person.bbox[1] + person.bbox[3] / 2

              // 距離を計算
              const distance = Math.sqrt(Math.pow(centerX - personCenterX, 2) + Math.pow(centerY - personCenterY, 2))

              // 距離が閾値以下なら同一人物と判断（感度に応じて調整）
              // 感度が高いほど大きな距離でもマッチングする（最大120px）
              const matchThreshold = 20 + sensitivity // 20〜120の範囲
              if (distance < matchThreshold) {
                matched = true

                // 位置を更新
                person.bbox = bbox
                person.lastSeen = now
                person.path.push({ x: centerX, y: centerY })

                // パスが一定以上の長さになったら古いポイントを削除
                if (person.path.length > 15) {
                  // 10→15に増やして軌跡を長く保持
                  person.path.shift()
                }

                // 横切ったかどうかを判定
                if (!person.counted) {
                  const pathLength = person.path.length

                  // 必要なポイント数を2に減らす（より早く検出）
                  if (pathLength >= 2) {
                    const firstX = person.path[0].x
                    const lastX = person.path[pathLength - 1].x
                    const deltaX = lastX - firstX

                    // 移動距離の閾値を使用（UIから調整可能）
                    const moveThreshold = threshold

                    // 左から右への移動（条件を緩和）
                    if (direction) {
                      // 単純に右方向への移動があればカウント
                      if (deltaX > moveThreshold) {
                        setCount((prev) => prev + 1)
                        person.counted = true
                        setHistory((prev) => [
                          ...prev,
                          {
                            timestamp: new Date(),
                            direction: "左から右",
                          },
                        ])
                        if (debugMode) {
                          console.log("カウント: 左から右", deltaX, firstX, lastX)
                        }
                      }
                    }
                    // 右から左への移動（条件を緩和）
                    else {
                      // 単純に左方向への移動があればカウント
                      if (deltaX < -moveThreshold) {
                        setCount((prev) => prev + 1)
                        person.counted = true
                        setHistory((prev) => [
                          ...prev,
                          {
                            timestamp: new Date(),
                            direction: "右から左",
                          },
                        ])
                        if (debugMode) {
                          console.log("カウント: 右から左", deltaX, firstX, lastX)
                        }
                      }
                    }

                    // デバッグモードでは移動情報を表示
                    if (debugMode && Math.abs(deltaX) > 10) {
                      console.log(
                        "移動検出:",
                        deltaX,
                        firstX,
                        lastX,
                        "条件:",
                        direction ? "左→右" : "右→左",
                        "閾値:",
                        moveThreshold,
                      )
                    }
                  }
                }

                break
              }
            }

            // 新しい人物として追加
            if (!matched) {
              const id = generateId()
              currentDetectedPeople.set(id, {
                id,
                bbox,
                lastSeen: now,
                counted: false,
                path: [{ x: centerX, y: centerY }],
              })
              if (debugMode) {
                console.log("新しい人物を検出:", id, centerX, centerY)
              }
            }
          }
        }

        // 一定時間見えなくなった人物を削除（時間を延長）
        for (const [id, person] of currentDetectedPeople.entries()) {
          if (now - person.lastSeen > 2000) {
            // 1000→2000に延長
            if (debugMode) {
              console.log("人物を削除:", id)
            }
            currentDetectedPeople.delete(id)
          }
        }

        // 検出結果を描画
        for (const [id, person] of currentDetectedPeople.entries()) {
          const [x, y, width, height] = person.bbox

          // バウンディングボックスを描画
          ctx.strokeStyle = person.counted ? "green" : "red"
          ctx.lineWidth = 2
          ctx.strokeRect(x, y, width, height)

          // デバッグモードではIDを表示
          if (debugMode) {
            ctx.fillStyle = "white"
            ctx.fillRect(x, y - 20, 60, 20)
            ctx.fillStyle = "black"
            ctx.font = "12px Arial"
            ctx.fillText(`ID: ${id.slice(0, 4)}`, x + 5, y - 5)
          }

          // 軌跡を描画
          if (person.path.length > 1) {
            ctx.beginPath()
            ctx.moveTo(person.path[0].x, person.path[0].y)

            for (let i = 1; i < person.path.length; i++) {
              ctx.lineTo(person.path[i].x, person.path[i].y)
            }

            ctx.strokeStyle = "blue"
            ctx.lineWidth = 2
            ctx.stroke()
          }
        }

        // 方向指示線を描画
        ctx.beginPath()
        ctx.moveTo(canvas.width / 2, 20)
        ctx.lineTo(direction ? canvas.width - 20 : 20, 20)
        ctx.strokeStyle = "yellow"
        ctx.lineWidth = 3
        ctx.stroke()

        // 矢印の先端を描画
        if (direction) {
          ctx.beginPath()
          ctx.moveTo(canvas.width - 20, 20)
          ctx.lineTo(canvas.width - 30, 10)
          ctx.lineTo(canvas.width - 30, 30)
          ctx.closePath()
          ctx.fillStyle = "yellow"
          ctx.fill()
        } else {
          ctx.beginPath()
          ctx.moveTo(20, 20)
          ctx.lineTo(30, 10)
          ctx.lineTo(30, 30)
          ctx.closePath()
          ctx.fillStyle = "yellow"
          ctx.fill()
        }

        // 状態を更新
        detectedPeopleRef.current = currentDetectedPeople
      } catch (error) {
        console.error("検出エラー:", error)
      }

      // 次のフレームを処理
      animationId = requestAnimationFrame(detectPeople)
    }

    if (isRunning) {
      detectPeople()
    }

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId)
      }
    }
  }, [model, isRunning, direction, debugMode, sensitivity, threshold, detectionInterval])

  const toggleDetection = () => {
    if (!isRunning && !cameraReady) {
      setupCamera()
    }
    setIsRunning((prev) => !prev)
  }

  const resetCounter = () => {
    setCount(0)
    setHistory([])
  }

  const toggleDirection = () => {
    setDirection((prev) => !prev)
  }

  const toggleDebugMode = () => {
    setDebugMode((prev) => !prev)
  }

  const toggleAdvanced = () => {
    setShowAdvanced((prev) => !prev)
  }

  // 処理時間に基づいて推奨設定を提案
  const getPerformanceRecommendation = () => {
    if (lastProcessTimeRef.current === 0) return null

    if (lastProcessTimeRef.current > 200) {
      return "処理が遅いです。解像度を下げるか、検出間隔を増やしてください。"
    } else if (lastProcessTimeRef.current > 100) {
      return "処理がやや遅いです。より良いパフォーマンスのために設定を調整してください。"
    }
    return "処理速度は良好です。"
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex justify-between items-center">
            <span>カメラ映像</span>
            <div className="text-xl">カウント: {count}人</div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cameraError && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              <p>{cameraError}</p>
              <button onClick={setupCamera} className="mt-2 text-sm underline">
                再試行
              </button>
            </div>
          )}
          <div className="relative">
            <video ref={videoRef} className="w-full rounded-lg" autoPlay playsInline muted />
            <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full" />
            {debugMode && (
              <div className="absolute top-2 left-2 bg-black bg-opacity-50 text-white p-2 rounded">
                {detectionInfo}
                {performanceInfo && <div>{performanceInfo}</div>}
                {getPerformanceRecommendation() && <div className="text-xs mt-1">{getPerformanceRecommendation()}</div>}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            <Button onClick={toggleDetection}>
              {isRunning ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
              {isRunning ? "停止" : "開始"}
            </Button>
            <Button variant="outline" onClick={resetCounter}>
              <RotateCcw className="mr-2 h-4 w-4" />
              リセット
            </Button>
            <Button variant="outline" onClick={toggleDirection}>
              <ArrowLeftRight className="mr-2 h-4 w-4" />
              方向: {direction ? "左→右" : "右→左"}
            </Button>
            <Button variant={debugMode ? "default" : "outline"} onClick={toggleDebugMode}>
              <Eye className="mr-2 h-4 w-4" />
              デバッグモード
            </Button>
            <Button variant={showAdvanced ? "default" : "outline"} onClick={toggleAdvanced}>
              <Settings className="mr-2 h-4 w-4" />
              詳細設定
            </Button>
          </div>

          {/* 感度調整スライダー */}
          <div className="mt-4">
            <label htmlFor="sensitivity" className="block text-sm font-medium mb-1">
              検出感度: {sensitivity}
            </label>
            <input
              type="range"
              id="sensitivity"
              min="0"
              max="100"
              value={sensitivity}
              onChange={(e) => setSensitivity(Number.parseInt(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>低（正確）</span>
              <span>高（敏感）</span>
            </div>
          </div>

          {/* 移動距離閾値スライダー */}
          <div className="mt-4">
            <label htmlFor="threshold" className="block text-sm font-medium mb-1">
              移動距離閾値: {threshold}px
            </label>
            <input
              type="range"
              id="threshold"
              min="5"
              max="100"
              value={threshold}
              onChange={(e) => setThreshold(Number.parseInt(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>小（敏感）</span>
              <span>大（正確）</span>
            </div>
          </div>

          {/* 詳細設定 */}
          {showAdvanced && (
            <div className="mt-4 p-4 border rounded-lg bg-gray-50">
              <h3 className="font-medium mb-2">パフォーマンス設定</h3>

              {/* 解像度設定 */}
              <div className="mb-3">
                <label className="block text-sm font-medium mb-1">カメラ解像度:</label>
                <div className="flex gap-2">
                  <Button
                    variant={resolution === "low" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setResolution("low")}
                  >
                    低 (320×240)
                  </Button>
                  <Button
                    variant={resolution === "medium" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setResolution("medium")}
                  >
                    中 (640×480)
                  </Button>
                  <Button
                    variant={resolution === "high" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setResolution("high")}
                  >
                    高 (1280×720)
                  </Button>
                </div>
              </div>

              {/* 検出間隔設定 */}
              <div>
                <label className="block text-sm font-medium mb-1">検出間隔:</label>
                <div className="flex gap-2">
                  <Button
                    variant={detectionInterval === 1 ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDetectionInterval(1)}
                  >
                    毎フレーム
                  </Button>
                  <Button
                    variant={detectionInterval === 2 ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDetectionInterval(2)}
                  >
                    1フレームおき
                  </Button>
                  <Button
                    variant={detectionInterval === 3 ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDetectionInterval(3)}
                  >
                    2フレームおき
                  </Button>
                </div>
              </div>

              <p className="text-xs text-gray-500 mt-3">
                古いPCや処理が遅い場合は、解像度を下げるか検出間隔を増やしてください。
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>通過履歴</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-40 overflow-y-auto">
            {history.length === 0 ? (
              <p className="text-muted-foreground">まだ記録がありません</p>
            ) : (
              <ul className="space-y-2">
                {history.map((entry, index) => (
                  <li key={index} className="text-sm">
                    {entry.timestamp.toLocaleTimeString()} - {entry.direction}に通過
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
