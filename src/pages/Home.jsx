import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Calendar, Clock, Scissors, User, Phone, CheckCircle, MessageCircle, ArrowRight, ArrowLeft, RefreshCw, Star, X, Ban, Users, AlertCircle } from 'lucide-react'
import { format, addMinutes, parse, isAfter, isBefore, isEqual, getDay } from 'date-fns'

export default function Home() {
  const [currentStep, setCurrentStep] = useState(1) // 1: Whats, 2: Nome, 3: Serviço, 4: Barbeiro, 5: Data/Hora, 6: Sucesso
  const [loading, setLoading] = useState(false)
  
  const [barbeiros, setBarbeiros] = useState([])
  const [servicos, setServicos] = useState([])
  const [whatsappCentral, setWhatsappCentral] = useState('')
  const [avisoTexto, setAvisoTexto] = useState('')
  const [availableSlots, setAvailableSlots] = useState([])
  const [dayIsClosed, setDayIsClosed] = useState(false)
  
  const [formData, setFormData] = useState({
    cliente_nome: '',
    cliente_whatsapp: '',
    barbeiro_id: '',
    barbeiro_nome: '',
    servico_id: '',
    servico_nome: '',
    servico_duracao: 30,
    data: format(new Date(), 'yyyy-MM-dd'),
    hora: ''
  })

  useEffect(() => {
    async function loadData() {
      try {
        const { data: bData } = await supabase.from('barbeiros').select('*').order('nome')
        setBarbeiros(bData || [])
        const { data: sData } = await supabase.from('servicos').select('*').order('nome')
        setServicos(sData || [])
        const { data: configData } = await supabase.from('configuracoes').select('*').eq('id', 'config').maybeSingle()
        if (configData) {
          setWhatsappCentral(configData.whatsapp_central)
          setAvisoTexto(configData.aviso_texto || '')
        }
      } catch (err) {
        console.error("Erro ao carregar dados:", err)
      }
    }
    loadData()
  }, [])

  const formatPhone = (v) => {
    if (!v) return ''
    v = v.replace(/\D/g, '')
    if (v.length <= 2) return `(${v}`
    if (v.length <= 7) return `(${v.slice(0, 2)}) ${v.slice(2)}`
    return `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7, 11)}`
  }

  // MOTOR DE CÁLCULO DE HORÁRIOS
  useEffect(() => {
    async function calculateSlots() {
      if (!formData.barbeiro_id || !formData.data || !formData.servico_id) return
      setLoading(true)

      try {
        const diaSemana = getDay(new Date(formData.data + 'T12:00:00'))
        const { data: isBlocked } = await supabase.from('bloqueios').select('id').eq('barbeiro_id', formData.barbeiro_id).eq('data', formData.data).maybeSingle()
        if (isBlocked) { 
          setAvailableSlots([]); 
          setDayIsClosed(true);
          setLoading(false); 
          return; 
        }

        const { data: exp } = await supabase.from('expediente').select('*').eq('barbeiro_id', formData.barbeiro_id).eq('dia_semana', diaSemana).eq('is_aberto', true).maybeSingle()
        if (!exp) { 
          setAvailableSlots([]); 
          setDayIsClosed(true);
          setLoading(false); 
          return; 
        }

        setDayIsClosed(false);
        const { data: booked } = await supabase.from('agendamentos').select('hora, duracao_servico').eq('barbeiro_id', formData.barbeiro_id).eq('data', formData.data).eq('status', 'confirmado')
        const { data: blockedHours } = await supabase.from('bloqueios_horarios').select('hora').eq('barbeiro_id', formData.barbeiro_id).eq('data', formData.data)
        const listBlockedHours = blockedHours?.map(bh => bh.hora) || []

        const slots = []
        const step = 10 

        const generateFromPeriod = (startStr, endStr) => {
          let current = parse(startStr, 'HH:mm', new Date())
          const end = parse(endStr, 'HH:mm', new Date())
          while (isBefore(current, end)) {
            const horaStr = format(current, 'HH:mm')
            const horaFimReq = format(addMinutes(current, formData.servico_duracao), 'HH:mm')
            
            const hasBookedConflict = booked?.some(b => {
              const bEnd = format(addMinutes(parse(b.hora, 'HH:mm', new Date()), b.duracao_servico), 'HH:mm')
              return (horaStr < bEnd && horaFimReq > b.hora)
            })

            const hasBlockedConflict = listBlockedHours.includes(horaStr)

            // NOVA TRAVA: Se for HOJE, não permitir horários que já passaram no relógio
            const isToday = formData.data === format(new Date(), 'yyyy-MM-dd')
            const nowStr = format(new Date(), 'HH:mm')
            const isPastTime = isToday && horaStr <= nowStr

            if (!hasBookedConflict && !hasBlockedConflict && !isPastTime && horaFimReq <= endStr) {
              slots.push(horaStr)
            }
            current = addMinutes(current, step)
          }
        }

        if (exp.inicio_1 && exp.fim_1) generateFromPeriod(exp.inicio_1, exp.fim_1)
        if (exp.inicio_2 && exp.fim_2) generateFromPeriod(exp.inicio_2, exp.fim_2)

        setAvailableSlots([...new Set(slots)])
      } catch (err) {
        console.error("Erro ao calcular horários:", err)
        setAvailableSlots([])
      } finally {
        setLoading(false)
      }
    }
    if (currentStep === 5) calculateSlots()
  }, [formData.barbeiro_id, formData.data, formData.servico_id, currentStep])

  const finalizeBooking = async () => {
    setLoading(true)
    const { error } = await supabase.from('agendamentos').insert([{
      cliente_nome: formData.cliente_nome,
      cliente_whatsapp: formData.cliente_whatsapp,
      barbeiro_id: formData.barbeiro_id,
      servico_id: formData.servico_id,
      servico_nome: formData.servico_nome,
      duracao_servico: formData.servico_duracao,
      data: formData.data,
      hora: formData.hora,
      hora_fim: format(addMinutes(parse(formData.hora, 'HH:mm', new Date()), formData.servico_duracao), 'HH:mm')
    }])
    if (!error) {
      setCurrentStep(6)
      setTimeout(() => {
        const handleWhatsAppRedirect = () => {
          let phone = whatsappCentral || '11999999999'
          phone = phone.replace(/\D/g, '')
          if (!phone.startsWith('55')) phone = '55' + phone
          const msg = `📅 *NOVO AGENDAMENTO*\n\n👤 *Nome:* ${formData.cliente_nome}\n✂️ *Serviço:* ${formData.servico_nome}\n📆 *Data:* ${format(new Date(formData.data + 'T12:00:00'), 'dd/MM/yyyy')}\n⏰ *Hora:* ${formData.hora}\n💈 *Barbeiro:* ${formData.barbeiro_nome}`
          window.location.href = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
        }
        handleWhatsAppRedirect()
      }, 2000)
    }
    setLoading(false)
  }

  const handleChangeName = () => {
    setFormData({...formData, cliente_nome: ''})
    setCurrentStep(2)
  }

  const renderStep = () => {
    return (
      <div className="animate-fade-in">
        {currentStep > 1 && currentStep < 6 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.5rem 0', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            <Phone size={14} color="var(--primary)" />
            <span>WhatsApp: <strong>{formatPhone(formData.cliente_whatsapp)}</strong></span>
            {currentStep === 2 && <button onClick={() => setCurrentStep(1)} style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--primary)', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Alterar</button>}
          </div>
        )}
        {(() => {
          switch(currentStep) {
            case 1:
              return (
                <div className="animate-fade-in">
                  <h2>Olá! Qual seu WhatsApp?</h2>
                  <input type="tel" value={formatPhone(formData.cliente_whatsapp)} onChange={e => setFormData({...formData, cliente_whatsapp: e.target.value.replace(/\D/g, '').slice(0, 11)})} placeholder="(00) 00000-0000" />
                  
                  {avisoTexto && (
                    <div className="card" style={{ marginTop: '1rem', background: 'rgba(212, 175, 55, 0.1)', border: '1px solid var(--primary)', padding: '1rem' }}>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                        <AlertCircle size={20} color="var(--primary)" style={{ flexShrink: 0 }} />
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-main)', margin: 0, lineHeight: '1.4', fontWeight: '500' }}>
                          {avisoTexto}
                        </p>
                      </div>
                    </div>
                  )}

                  <button onClick={async () => { 
                    setLoading(true); 
                    const { data } = await supabase.from('clientes').select('nome').eq('whatsapp', formData.cliente_whatsapp).maybeSingle(); 
                    setLoading(false);
                    if (data) { setFormData({...formData, cliente_nome: data.nome}); setCurrentStep(3); } 
                    else { setCurrentStep(2); }
                  }} className="btn btn-primary mt-4" disabled={!formData.cliente_whatsapp || loading}>{loading ? 'Verificando...' : 'Avançar'}</button>
                </div>
              )
            case 2:
              return (
                <div className="animate-fade-in">
                  <h2>É sua primeira vez aqui?</h2>
                  <p className="mb-4">Como devemos te chamar?</p>
                  <input type="text" value={formData.cliente_nome} onChange={e => setFormData({...formData, cliente_nome: e.target.value})} placeholder="Seu nome ou apelido" />
                  <button onClick={async () => { 
                    if (!formData.cliente_nome) return;
                    setLoading(true);
                    await supabase.from('clientes').upsert({ whatsapp: formData.cliente_whatsapp, nome: formData.cliente_nome }); 
                    setLoading(false);
                    setCurrentStep(3); 
                  }} className="btn btn-primary mt-4" disabled={loading}>Confirmar Nome</button>
                </div>
              )
            case 3:
              return (
                <div className="animate-fade-in">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h2>Olá, {formData.cliente_nome}!</h2>
                    <button onClick={handleChangeName} style={{ fontSize: '0.7rem', color: 'var(--primary)', background: 'transparent', border: 'none', cursor: 'pointer' }}>Não é você?</button>
                  </div>
                  <p className="mb-4">O que vamos fazer hoje?</p>
                  <div className="grid-stack">
                    {servicos.map(s => (
                      <div key={s.id} className="card clickable" onClick={() => { setFormData({...formData, servico_id: s.id, servico_nome: s.nome, servico_duracao: s.duracao_minutos}); setCurrentStep(4); }} style={{ borderLeft: '4px solid var(--primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div><strong>{s.nome}</strong><p style={{ fontSize: '0.8rem', opacity: 0.7 }}>🕒 {s.duracao_minutos} min</p></div>
                        <Scissors size={18} style={{ opacity: 0.3 }} />
                      </div>
                    ))}
                  </div>
                </div>
              )
            case 4:
              return (
                <div className="animate-fade-in">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
                    <ArrowLeft onClick={() => setCurrentStep(3)} style={{ cursor: 'pointer' }} />
                    <h2 style={{ margin: 0 }}>Com qual profissional?</h2>
                  </div>
                  <div className="grid-stack">
                    {barbeiros.map(b => (
                      <div key={b.id} className="card clickable" onClick={() => { setFormData({...formData, barbeiro_id: b.id, barbeiro_nome: b.nome}); setCurrentStep(5); }} style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{ background: 'var(--primary)', width: '35px', height: '35px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.8rem', color: '#000' }}>{b.nome.charAt(0)}</div>
                        <strong>{b.nome}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )
            case 5:
              return (
                <div className="animate-fade-in">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
                    <ArrowLeft onClick={() => setCurrentStep(4)} style={{ cursor: 'pointer' }} />
                    <h2 style={{ margin: 0 }}>Para quando?</h2>
                  </div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    Escolha o dia que deseja o serviço:
                  </label>
                  <input type="date" min={format(new Date(), 'yyyy-MM-dd')} value={formData.data} onChange={e => setFormData({...formData, data: e.target.value})} />
                  <div style={{ marginTop: '1rem' }}>
                    {loading ? (
                      <p style={{ textAlign: 'center', padding: '2rem' }}>Buscando horários...</p>
                    ) : availableSlots.length === 0 ? (
                      <div className="card" style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', textAlign: 'center', padding: '1.5rem' }}>
                        <Ban size={32} color="var(--danger)" style={{ margin: '0 auto 10px' }} />
                        
                        {dayIsClosed ? (
                          <>
                            <h4 style={{ color: 'var(--danger)', marginBottom: '5px' }}>Barbearia Fechada</h4>
                            <p style={{ fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                              Infelizmente {formData.barbeiro_nome} não atende nesta data.
                            </p>
                          </>
                        ) : (
                          <>
                            <h4 style={{ color: 'var(--danger)', marginBottom: '5px' }}>Sem horários disponíveis</h4>
                            <p style={{ fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                              Infelizmente não temos vagas para {formData.barbeiro_nome} no dia {format(new Date(formData.data + 'T12:00:00'), 'dd/MM')}.
                            </p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              <button onClick={async () => {
                                const cleanPhone = whatsappCentral.replace(/\D/g, '')
                                
                                console.log("Tentando salvar na lista de espera:", {
                                  nome: formData.cliente_nome,
                                  whats: formData.cliente_whatsapp,
                                  data: formData.data,
                                  barbeiro: formData.barbeiro_id
                                });
                                
                                const { error } = await supabase.from('lista_espera').insert([{
                                  cliente_nome: formData.cliente_nome,
                                  cliente_whatsapp: formData.cliente_whatsapp,
                                  data: formData.data,
                                  barbeiro_id: formData.barbeiro_id
                                }])

                                if (error) console.error("Erro ao salvar na lista de espera:", error);

                                const msg = `Oi, tentei marcar para o dia ${format(new Date(formData.data + 'T12:00:00'), 'dd/MM/yyyy')} e não consegui vaga. Se tiver alguma desistência, tenho interesse! Me avise aqui no zap.`
                                window.open(`https://wa.me/55${cleanPhone}?text=${encodeURIComponent(msg)}`)
                              }} className="btn btn-primary" style={{ background: '#25d366', borderColor: '#25d366', fontSize: '0.85rem' }}>
                                <MessageCircle size={16} /> Tentar desistência (Lista de Espera)
                              </button>
                            </div>
                          </>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: dayIsClosed ? '0' : '10px' }}>
                          <button onClick={() => setCurrentStep(4)} className="btn btn-outline" style={{ fontSize: '0.85rem' }}>
                            <Users size={16} /> Tentar outro profissional
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                        {availableSlots.map(slot => (
                          <button key={slot} onClick={() => setFormData({...formData, hora: slot})} className={`btn ${formData.hora === slot ? 'btn-primary' : 'btn-outline'}`} style={{ padding: '0.5rem', fontSize: '0.8rem' }}>{slot}</button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="card" style={{ marginTop: '1.5rem', background: 'rgba(212, 175, 55, 0.05)', border: '1px dashed var(--primary)', padding: '1rem', marginBottom: '0' }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                      <MessageCircle size={20} color="var(--primary)" style={{ flexShrink: 0 }} />
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-main)', margin: 0, lineHeight: '1.4' }}>
                        <strong>Quase lá!</strong> Ao confirmar, abriremos seu WhatsApp com uma mensagem pronta para o barbeiro confirmar seu horário.
                      </p>
                    </div>
                  </div>

                  <button onClick={finalizeBooking} className="btn btn-primary mt-4" disabled={!formData.hora || loading}>Finalizar Agendamento</button>
                </div>
              )
            case 6:
              return (<div className="text-center animate-fade-in"><CheckCircle size={80} color="var(--success)" style={{ margin: '0 auto 1rem' }} /><h1>Agendado com Sucesso!</h1><p>Estamos te redirecionando para o WhatsApp para confirmar...</p><RefreshCw className="animate-spin mt-4" style={{ margin: '0 auto' }} /></div>)
            default: return null
          }
        })()}
      </div>
    )
  }

  return (
    <div className="container">
      <header className="text-center mb-6">
        <h1 style={{ letterSpacing: '2px', textTransform: 'uppercase' }}>Mailson Styles</h1>
        <div style={{ width: '50px', height: '2px', background: 'var(--primary)', margin: '0 auto' }}></div>
      </header>
      <div className="card shadow-lg" style={{ minHeight: '400px', display: 'flex', flexDirection: 'column', padding: '2rem' }}>{renderStep()}</div>
      <p style={{ textAlign: 'center', fontSize: '0.7rem', opacity: 0.4, marginTop: '1rem' }}>Desenvolvido para Barbearias Profissionais</p>
    </div>
  )
}
