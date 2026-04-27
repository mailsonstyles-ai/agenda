import React, { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { LogIn, Lock, Mail, AlertCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError('E-mail ou senha incorretos.')
      setLoading(false)
    } else {
      navigate('/admin')
    }
  }

  return (
    <div className="container animate-fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
      <div className="card shadow-lg" style={{ maxWidth: '400px', width: '100%', padding: '2.5rem' }}>
        <header className="text-center mb-8">
          <div style={{ background: 'var(--primary)', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
            <Lock color="var(--bg-dark)" size={30} />
          </div>
          <h2 style={{ letterSpacing: '1px' }}>ACESSO RESTRITO</h2>
          <p style={{ opacity: 0.6, fontSize: '0.9rem' }}>Painel Administrativo</p>
        </header>

        <form onSubmit={handleLogin}>
          <div className="mb-4">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '0.9rem' }}>
              <Mail size={16} color="var(--primary)" /> E-mail
            </label>
            <input 
              type="email" 
              placeholder="seu@email.com" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required 
            />
          </div>

          <div className="mb-6">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '0.9rem' }}>
              <Lock size={16} color="var(--primary)" /> Senha
            </label>
            <input 
              type="password" 
              placeholder="••••••••" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required 
            />
          </div>

          {error && (
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: '10px', borderRadius: '8px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Entrando...' : 'Entrar no Painel'} <LogIn size={18} style={{ marginLeft: '8px' }} />
          </button>
        </form>
        
        <p style={{ textAlign: 'center', marginTop: '2rem', fontSize: '0.7rem', opacity: 0.4 }}>
          © Mailson Styles - Todos os direitos reservados
        </p>
      </div>
    </div>
  )
}
