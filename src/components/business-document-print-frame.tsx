"use client";

import { useRef, useState, useImperativeHandle, type Ref, type ReactNode } from "react";
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
