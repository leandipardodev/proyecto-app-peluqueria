"use client";

import BaseModal from "@/components/ui/modal";
import type { ReactNode } from "react";

interface ServiceModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export default function ServiceModal({
  open,
  onClose,
  title,
  children,
}: ServiceModalProps) {
  return (
    <BaseModal open={open} onClose={onClose} title={title} maxWidth="md">
      <div className="p-6 overflow-y-auto overscroll-y-contain">{children}</div>
    </BaseModal>
  );
}
