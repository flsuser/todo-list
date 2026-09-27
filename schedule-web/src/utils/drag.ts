/**
 * 基于 Pointer Events 的轻量拖拽封装。
 * 日历色块的移动/缩放都用它，避免在多个组件里重复写 pointermove/pointerup 的挂载与清理。
 */
export interface PointerDragOptions {
  /** 拖拽过程中的位移回调，dx/dy 为相对起点的像素差 */
  onMove: (dx: number, dy: number, ev: PointerEvent) => void
  /** 松手回调；moved 为 false 表示只是点击，未真正拖动 */
  onEnd: (ev: PointerEvent, moved: boolean) => void
  /** 超过该位移才算开始拖拽，避免误触 */
  threshold?: number
  /** 拖拽期间给 body 加的类名 */
  activeClass?: string
}

export function startPointerDrag(e: PointerEvent, opts: PointerDragOptions): void {
  const startX = e.clientX
  const startY = e.clientY
  const threshold = opts.threshold ?? 4
  // 默认加在 body 上，仅用于统一鼠标手势与禁止选中文本
  const activeClass = opts.activeClass ?? 'is-dragging'
  let moved = false

  const move = (ev: PointerEvent) => {
    const dx = ev.clientX - startX
    const dy = ev.clientY - startY
    if (!moved) {
      if (Math.hypot(dx, dy) < threshold) return
      moved = true
      document.body.classList.add(activeClass)
      // 拖拽期间禁止选中文本，否则鼠标划过会把日历文字选中
      ev.preventDefault()
    }
    opts.onMove(dx, dy, ev)
  }

  const up = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancel)
    if (moved) document.body.classList.remove(activeClass)
    opts.onEnd(ev, moved)
  }

  const cancel = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancel)
    document.body.classList.remove(activeClass)
  }

  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancel)
}

/** 把鼠标位置换算成「命中了哪一天哪一分钟」，供时间轴拖拽使用 */
export function hitTestColumn(
  clientX: number,
  columns: { left: number; width: number; key: string }[],
): string | null {
  for (const col of columns) {
    if (clientX >= col.left && clientX <= col.left + col.width) return col.key
  }
  return null
}
