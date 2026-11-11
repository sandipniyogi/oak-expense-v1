'use client';
import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import styles from './PaymentScreenshotPreview.module.css';

const MIN_ZOOM = 50;
const MAX_ZOOM = 500;
const FIT = 100;
const STEP = 25;
const HOVER_SCALE = 2.5;

export default function PaymentScreenshotPreview({file}) {
  const [source, setSource] = useState(null);
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setSource({file, url});
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return file && source?.file === file
    ? <ZoomPreview key={source.url} url={source.url} name={file.name}/>
    : null;
}

function ZoomPreview({url, name}) {
  const viewport = useRef(null);
  const image = useRef(null);
  const anchor = useRef(null);
  const pointer = useRef(null);
  const [size, setSize] = useState(null);
  const [box, setBox] = useState(null);
  const [zoom, setZoom] = useState(FIT);
  const [dragging, setDragging] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hoverEnabled, setHoverEnabled] = useState(true);
  const [hoverPoint, setHoverPoint] = useState(null);

  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const measure = () => setBox(old => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      return old?.width === width && old.height === height ? old : {width, height};
    });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [failed]);

  useLayoutEffect(() => {
    const point = anchor.current;
    anchor.current = null;
    const el = viewport.current;
    if (!point || !el || !image.current) return;
    if (point.reset) {
      el.scrollTo(0, 0);
      return;
    }
    const bounds = image.current.getBoundingClientRect();
    const view = el.getBoundingClientRect();
    el.scrollLeft += bounds.left + point.x * bounds.width - view.left - el.clientWidth / 2;
    el.scrollTop += bounds.top + point.y * bounds.height - view.top - el.clientHeight / 2;
  }, [zoom]);

  const fitScale = size && box ? Math.min(1, box.width / size.width, box.height / size.height) : 0;
  const width = fitScale && Math.max(1, Math.floor(size.width * fitScale * zoom / FIT));

  function changeZoom(value, reset = false) {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
    const el = viewport.current;
    if (!el || !width) return;
    setHoverPoint(null);
    if (next === zoom) {
      if (reset) el.scrollTo(0, 0);
      return;
    }
    if (reset) {
      anchor.current = {reset: true};
    } else {
      const bounds = image.current.getBoundingClientRect();
      const view = el.getBoundingClientRect();
      const relative = (centre, edge, length) => Math.min(1, Math.max(0, (centre - edge) / length));
      anchor.current = {
        x: relative(view.left + el.clientWidth / 2, bounds.left, bounds.width),
        y: relative(view.top + el.clientHeight / 2, bounds.top, bounds.height)
      };
    }
    setZoom(next);
  }

  function startDrag(event) {
    const el = viewport.current;
    if (event.pointerType !== 'mouse' || event.button !== 0 ||
        (el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current = {id:event.pointerId, x:event.clientX, y:event.clientY,
      left:el.scrollLeft, top:el.scrollTop};
    setHoverPoint(null);
    setDragging(true);
  }

  function movePointer(event) {
    const drag = pointer.current;
    const el = viewport.current;
    if (drag) {
      if (event.pointerId !== drag.id) return;
      el.scrollLeft = drag.left + drag.x - event.clientX;
      el.scrollTop = drag.top + drag.y - event.clientY;
      return;
    }
    if (!hoverEnabled || !width || event.pointerType !== 'mouse' || event.buttons) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const view = el.getBoundingClientRect();
    setHoverPoint({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
      right: event.clientX < view.left + el.clientWidth / 2,
    });
  }

  function endDrag() {
    pointer.current = null;
    setDragging(false);
  }

  function zoomWithKey(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (!['+', '=', '-', '0'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === '0') changeZoom(FIT, true);
    else changeZoom(zoom + (event.key === '-' ? -STEP : STEP));
  }

  const zoomReady = Boolean(width) && !failed;
  const showMagnifier = zoomReady && hoverEnabled && hoverPoint && !dragging;
  const lensWidth = box ? Math.max(1, Math.min(240, Math.floor(box.width / 2) - 12)) : 0;
  const lensHeight = Math.round(lensWidth * 0.72);
  return <div className={styles.preview}>
    <div className={styles.controls} role="group" aria-label={`Screenshot controls for ${name}`}>
      <button type="button" aria-label={`Zoom out ${name}`} disabled={!zoomReady || zoom <= MIN_ZOOM}
        onClick={() => changeZoom(zoom - STEP)}>−</button>
      <label className={styles.slider}>
        <span>Zoom</span>
        <input type="range" min={MIN_ZOOM} max={MAX_ZOOM} step={STEP} value={zoom} disabled={!zoomReady}
          aria-label={`Zoom ${name}`} aria-valuetext={`${zoom}% of fit`}
          onChange={event => changeZoom(Number(event.target.value))}/>
        <span className={styles.percent}>{zoom}%</span>
      </label>
      <button type="button" aria-label={`Zoom in ${name}`} disabled={!zoomReady || zoom >= MAX_ZOOM}
        onClick={() => changeZoom(zoom + STEP)}>+</button>
      <button type="button" disabled={!zoomReady} onClick={() => changeZoom(FIT, true)}>Fit image</button>
      <button type="button" className={styles.hoverToggle} disabled={!zoomReady}
        aria-pressed={hoverEnabled} onClick={() => {
          setHoverEnabled(enabled => !enabled);
          setHoverPoint(null);
        }}>Hover zoom</button>
      <a href={url} target="_blank" rel="noopener noreferrer" className="button-link">Open full image</a>
    </div>
    {failed ? <p role="status" className="message">This image format cannot be previewed in this browser.</p> :
      <div className={styles.previewArea}>
        <div ref={viewport} className={styles.viewport} tabIndex={0} role="region"
          aria-label={`Screenshot preview for ${name}`} onKeyDown={zoomWithKey}
          onScroll={() => setHoverPoint(null)}>
          <div className={styles.stage}>
            <img ref={image} src={url} alt={`Screenshot ${name}`} draggable={false}
              className={dragging ? styles.dragging : zoom > FIT ? styles.pannable : undefined}
              style={{width:width || 0, visibility:width ? 'visible' : 'hidden'}}
              onLoad={event => setSize({width:event.currentTarget.naturalWidth, height:event.currentTarget.naturalHeight})}
              onError={() => setFailed(true)}
              onPointerDown={startDrag} onPointerEnter={movePointer} onPointerMove={movePointer}
              onPointerLeave={() => setHoverPoint(null)} onLostPointerCapture={endDrag}/>
          </div>
        </div>
        {showMagnifier && <div aria-hidden="true" className={styles.magnifier}
          style={{
            width: lensWidth,
            height: lensHeight,
            [hoverPoint.right ? 'right' : 'left']: 10,
            backgroundImage: `url("${url}")`,
            backgroundSize: `${width * HOVER_SCALE}px auto`,
            backgroundPosition: `${lensWidth / 2 - hoverPoint.x * HOVER_SCALE}px ${lensHeight / 2 - hoverPoint.y * HOVER_SCALE}px`,
          }}/>}
      </div>
    }
    {!failed && zoom > FIT && <p className="message">Drag or scroll inside the preview to inspect the screenshot.</p>}
  </div>;
}
