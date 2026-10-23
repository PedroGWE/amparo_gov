import { createContext, useContext, useEffect, useId } from 'react'

export const EducaWorkContext = createContext<(id: string, dirty: boolean) => void>(() => {})
export function useUnsavedWork(dirty: boolean) {
  const id = useId()
  const register = useContext(EducaWorkContext)
  useEffect(() => {
    register(id, dirty)
    return () => register(id, false)
  }, [id, dirty, register])
}
