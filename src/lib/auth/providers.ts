export interface AuthProvider {
  id: string
  enabled: boolean
  label: string
}

export const AUTH_PROVIDERS: Record<string, AuthProvider> = {
  google: {
    id: 'google',
    enabled: true,
    label: 'Google',
  },
  facebook: {
    id: 'facebook',
    enabled: false,
    label: 'Facebook',
  },
  zalo: {
    id: 'zalo',
    enabled: true,
    label: 'Zalo',
  },
  email: {
    id: 'email',
    enabled: true,
    label: 'Email',
  },
}
