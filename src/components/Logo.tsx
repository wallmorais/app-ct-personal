import { useState } from 'react';

interface LogoProps {
  /** Mantido por compatibilidade com chamadas existentes; ambos usam a mesma logo original. */
  variant?: 'light' | 'dark';
  /** Altura da imagem em pixels. */
  height?: number;
  className?: string;
}

/**
 * Renderiza a logomarca ORIGINAL (sem nenhuma alteração) a partir de
 * /public/logo.png. Use a versão TEAL da logo (fundo transparente), que
 * fica legível tanto no tema escuro do app quanto no fundo branco do PDF.
 *
 * Enquanto o arquivo não existir, mostra apenas um texto simples — nenhuma
 * recriação/aproximação da marca é desenhada.
 */
export function Logo({ variant = 'light', height = 44, className }: LogoProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    const textColor = variant === 'light' ? 'text-brand-light' : 'text-brand';
    return (
      <span
        className={`font-extrabold tracking-tight ${textColor} ${className ?? ''}`}
        style={{ fontSize: height * 0.4 }}
      >
        WAL MORAIS
      </span>
    );
  }

  return (
    <img
      src="/logo.png"
      alt="Wal Morais — Personal Trainer"
      style={{ height, width: 'auto' }}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
