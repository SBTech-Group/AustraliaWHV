// Loader do SDK v2 do Mercado Pago (Checkout Bricks).
// Carregado sob demanda — só na tela de pagamento.

const PUBLIC_KEY = import.meta.env.VITE_MP_PUBLIC_KEY as string

// Valor numérico cobrado (o backend é a fonte de verdade; aqui é só p/ exibir no Brick).
export const MP_AMOUNT = Number(import.meta.env.VITE_PRODUCT_PRICE_NUM ?? '49.90')

let instance: Promise<MercadoPagoInstance> | null = null

export function loadMercadoPago(): Promise<MercadoPagoInstance> {
  if (instance) return instance

  instance = new Promise((resolve, reject) => {
    if (!PUBLIC_KEY) {
      reject(new Error('VITE_MP_PUBLIC_KEY não configurada.'))
      return
    }

    const make = () => resolve(new window.MercadoPago(PUBLIC_KEY, { locale: 'pt-BR' }))

    if (window.MercadoPago) {
      make()
      return
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-mp-sdk]')
    if (existing) {
      existing.addEventListener('load', make)
      existing.addEventListener('error', () => reject(new Error('Falha ao carregar SDK Mercado Pago')))
      return
    }

    const script = document.createElement('script')
    script.src = 'https://sdk.mercadopago.com/js/v2'
    script.dataset.mpSdk = 'true'
    script.onload = make
    script.onerror = () => reject(new Error('Falha ao carregar SDK Mercado Pago'))
    document.body.appendChild(script)
  })

  return instance
}

// Tipagem mínima do SDK (evita `any` espalhado).
export interface MercadoPagoInstance {
  bricks(): {
    create(
      brick: 'payment' | 'cardPayment',
      containerId: string,
      settings: Record<string, unknown>,
    ): Promise<{ unmount(): void }>
  }
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    MercadoPago: new (publicKey: string, opts?: { locale?: string }) => MercadoPagoInstance
  }
}
