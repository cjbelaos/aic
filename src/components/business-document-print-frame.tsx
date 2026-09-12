"use client";

import { useEffect, useRef, useState, useImperativeHandle, type Ref, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { businessDocumentPrintShell } from "./business-document-print-layout";

export interface BusinessDocumentPrintHandle {
  print: () => Promise<void>;
}

export function BusinessDocumentPrintFrame({ children, title, ref }: {
  children: ReactNode;
  title: string;
  ref?: Ref<BusinessDocumentPrintHandle>;
}) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const frame = iframe.current;
    if (!frame || !body) return;
    const style = body.ownerDocument.createElement("style");
    style.textContent = "@media screen and (max-width: 793px) { .receipt { width: 210mm; max-width: none; margin: 0; zoom: var(--preview-scale, 1); } }";
    body.ownerDocument.head.appendChild(style);
    const resize = () => body.ownerDocument.documentElement.style.setProperty("--preview-scale", String(Math.min(1, frame.clientWidth / (210 * 96 / 25.4))));
    const observer = new ResizeObserver(resize);
    observer.observe(frame);
    resize();
    return () => { observer.disconnect(); style.remove(); };
  }, [body]);
  useImperativeHandle(ref, () => ({
    async print() {
      const frame = iframe.current;
      if (!frame?.contentWindow || !body || !body.firstElementChild) throw new Error("The preview is still loading. Please try again.");
      await Promise.all(Array.from(body.querySelectorAll("img")).map(img => img.decode()));
      await frame.contentDocument?.fonts.ready;
      frame.contentDocument!.title = title;
      frame.contentWindow.focus();
      frame.contentWindow.print();
    },
  }), [body, title]);
  return <>
    <iframe ref={iframe} srcDoc={businessDocumentPrintShell} title={title} className="w-full h-full border-none" onLoad={() => setBody(iframe.current?.contentDocument?.body ?? null)} />
    {body && createPortal(children, body)}
  </>;
}
