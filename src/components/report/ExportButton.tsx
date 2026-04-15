import React from 'react';
import Button from '../common/Button';

interface ExportButtonProps {
  onExport: (format: 'pdf' | 'excel') => void;
}

export default function ExportButton({ onExport }: ExportButtonProps) {
  return <Button label="Export PDF" onPress={() => onExport('pdf')} />;
}
