interface LogoProps {
  /** 'light' = uso sobre fundo escuro (app); 'dark' = uso sobre fundo claro (PDF/impressão). */
  variant?: 'light' | 'dark';
  /** Altura de referência em pixels (controla o tamanho da fonte). */
  height?: number;
  className?: string;
}

/**
 * Wordmark do produto: "PT.Control".
 * A identidade exibida é sempre a marca do sistema — nunca o nome do
 * desenvolvedor ou de um professor específico. Créditos ao desenvolvedor
 * ficam apenas na seção "Sobre" (Config).
 */
export function Logo({ variant = 'light', height = 44, className }: LogoProps) {
  const accent = variant === 'light' ? 'text-brand-light' : 'text-brand';
  const base = variant === 'light' ? 'text-base-fg' : 'text-slate-900';
  return (
    <span
      className={`font-extrabold tracking-tight leading-none select-none ${className ?? ''}`}
      style={{ fontSize: Math.round(height * 0.45) }}
    >
      <span className={base}>PT</span>
      <span className={accent}>.Control</span>
    </span>
  );
}
