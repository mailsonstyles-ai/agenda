import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Calendar, Clock, Copy, MessageCircle, RefreshCw, Trash2, ChevronLeft, Users, List, UserPlus, Settings, Check, Plus, Save, CalendarDays, Ban, Scissors, AlertCircle, Share2, Phone, X, AlertTriangle, PlusCircle, Pencil, Search, LogOut } from 'lucide-react'
import { format, addMinutes, parse, isAfter, isBefore, getDay } from 'date-fns'
import { Link, useNavigate } from 'react-router-dom'

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

export default function Admin() {
  const [tab, setTab] = useState('agenda') 
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const navigate = useNavigate()
  
  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }
  const [barbeiros, setBarbeiros] = useState([])
  const [servicos, setServicos] = useState([])
  const [clientes, setClientes] = useState([])
  const [selectedBarbeiro, setSelectedBarbeiro] = useState('')
  const [appointments, setAppointments] = useState([])
  const [listaEspera, setListaEspera] = useState([])
  const [loading, setLoading] = useState(false)
  
  const [whatsappCentral, setWhatsappCentral] = useState('')
  const [avisoTexto, setAvisoTexto] = useState('')
  const [savingConfig, setSavingConfig] = useState(false)
  
  // Modal de Avisos
  const [modal, setModal] = useState({ show: false, title: '', message: '', type: 'info' })
  
  // Filtro de Agenda
  const [filterBarbeiroId, setFilterBarbeiroId] = useState('all')
  
  // Agendamento Manual / Edição
  const [showAddManual, setShowAddManual] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [manualBooking, setManualBooking] = useState({
    barbeiro_id: '',
    servico_id: '',
    data: format(new Date(), 'yyyy-MM-dd'),
    hora: '09:00',
    cliente_id: 'new',
    cliente_nome: '',
    cliente_whatsapp: ''
  })
  const [manualSlots, setManualSlots] = useState([])
  const [manualSlotsLoading, setManualSlotsLoading] = useState(false)

  // Calcula horários disponíveis para o agendamento manual
  useEffect(() => {
    async function calcManualSlots() {
      if (!manualBooking.barbeiro_id || !manualBooking.servico_id || !manualBooking.data) return
      setManualSlotsLoading(true)
      try {
        // Busca duração do serviço direto do banco (evita stale closure)
        const { data: servicoData } = await supabase.from('servicos').select('duracao_minutos').eq('id', manualBooking.servico_id).maybeSingle()
        if (!servicoData) { setManualSlots([]); setManualSlotsLoading(false); return }
        const duracao = servicoData.duracao_minutos

        const diaSemana = getDay(new Date(manualBooking.data + 'T12:00:00'))
        const { data: exp } = await supabase.from('expediente').select('*').eq('barbeiro_id', manualBooking.barbeiro_id).eq('dia_semana', diaSemana).maybeSingle()
        if (!exp || !exp.is_aberto) { setManualSlots([]); setManualSlotsLoading(false); return }

        const { data: bloq } = await supabase.from('bloqueios').select('id').eq('barbeiro_id', manualBooking.barbeiro_id).eq('data', manualBooking.data).maybeSingle()
        if (bloq) { setManualSlots([]); setManualSlotsLoading(false); return }

        const { data: booked } = await supabase.from('agendamentos').select('hora, duracao_servico, id').eq('barbeiro_id', manualBooking.barbeiro_id).eq('data', manualBooking.data)
        const { data: blockedHours } = await supabase.from('bloqueios_horarios').select('hora').eq('barbeiro_id', manualBooking.barbeiro_id).eq('data', manualBooking.data)
        const listBlockedHours = blockedHours?.map(bh => bh.hora) || []

        const slots = []

        const generateFromPeriod = (startStr, endStr) => {
          let current = parse(startStr, 'HH:mm', new Date())
          const end = parse(endStr, 'HH:mm', new Date())
          while (isBefore(current, end)) {
            const horaStr = format(current, 'HH:mm')
            const horaFimReq = format(addMinutes(current, duracao), 'HH:mm')
            const hasBookedConflict = booked?.some(b => {
              if (editingId && b.id === editingId) return false // ignora o próprio agendamento ao editar
              const bEnd = format(addMinutes(parse(b.hora, 'HH:mm', new Date()), b.duracao_servico), 'HH:mm')
              return horaStr < bEnd && horaFimReq > b.hora
            })
            const hasBlockedConflict = listBlockedHours.includes(horaStr)
            if (!hasBookedConflict && !hasBlockedConflict && horaFimReq <= endStr) slots.push(horaStr)
            current = addMinutes(current, duracao)
          }
        }

        if (exp.inicio_1 && exp.fim_1) generateFromPeriod(exp.inicio_1, exp.fim_1)
        if (exp.inicio_2 && exp.fim_2) generateFromPeriod(exp.inicio_2, exp.fim_2)
        setManualSlots([...new Set(slots)])
      } catch (err) {
        console.error('Erro ao calcular slots manuais:', err)
        setManualSlots([])
      } finally {
        setManualSlotsLoading(false)
      }
    }
    if (showAddManual) calcManualSlots()
  }, [manualBooking.barbeiro_id, manualBooking.servico_id, manualBooking.data, showAddManual, editingId])

  // Expediente em massa
  const [selectedDays, setSelectedDays] = useState([])
  const [bulkHours, setBulkHours] = useState({ inicio_1: '08:00', fim_1: '12:00', inicio_2: '14:00', fim_2: '19:00', is_aberto: true })
  
  // Central de Bloqueios
  const [allBloqueiosDias, setAllBloqueiosDias] = useState([])
  const [allBloqueiosHoras, setAllBloqueiosHoras] = useState([])
  const [bloqueioRange, setBloqueioRange] = useState({ inicio: '12:00', fim: '13:00' })

  const fetchData = async () => {
    try {
      setLoading(true)
      const { data: bData } = await supabase.from('barbeiros').select('*').order('nome')
      if (bData) { setBarbeiros(bData); if (!selectedBarbeiro && bData.length > 0) setSelectedBarbeiro(bData[0].id); }

      const { data: sData } = await supabase.from('servicos').select('*').order('nome')
      if (sData) setServicos(sData)

      const { data: configData, error: configError } = await supabase.from('configuracoes').select('*').eq('id', 'config').maybeSingle()
      if (configData) {
        setWhatsappCentral(configData.whatsapp_central || '')
        setAvisoTexto(configData.aviso_texto || '')
      }

      const { data: cData } = await supabase.from('clientes').select('*').order('nome')
      if (cData) setClientes(cData)

      if (tab === 'agenda') {
        const { data: aData } = await supabase.from('agendamentos').select('*, barbeiros(nome)').eq('data', date).order('hora')
        setAppointments(aData || [])
      }

      if (tab === 'espera') {
        const { data: eData, error: eError } = await supabase.from('lista_espera').select('*, barbeiros(nome)').eq('data', date).order('created_at')
        console.log("Busca na lista de espera para a data:", date, "Resultado:", eData, "Erro:", eError)
        setListaEspera(eData || [])
      }

      if (tab === 'expediente' && selectedBarbeiro) {
        const { data: expData } = await supabase.from('expediente').select('dia_semana').eq('barbeiro_id', selectedBarbeiro).eq('is_aberto', true)
        if (expData) setSelectedDays(expData.map(e => e.dia_semana))
      }

      if (tab === 'bloqueios' && selectedBarbeiro) {
        const { data: dData } = await supabase.from('bloqueios').select('*').eq('barbeiro_id', selectedBarbeiro).order('data')
        setAllBloqueiosDias(dData || [])
        const { data: hData } = await supabase.from('bloqueios_horarios').select('*').eq('barbeiro_id', selectedBarbeiro).order('data', 'hora')
        setAllBloqueiosHoras(hData || [])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [tab, date, selectedBarbeiro])

  const formatPhone = (v) => {
    if (!v) return ''
    v = v.replace(/\D/g, '')
    if (v.length <= 2) return `(${v}`
    if (v.length <= 7) return `(${v.slice(0, 2)}) ${v.slice(2)}`
    return `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7, 11)}`
  }

  const handleShareAgenda = () => {
    let filtered = appointments
    if (filterBarbeiroId !== 'all') {
      filtered = appointments.filter(a => a.barbeiro_id === filterBarbeiroId)
    }

    if (filtered.length === 0) return setModal({ show: true, title: 'Agenda Vazia', message: 'Nenhum agendamento encontrado para compartilhar.', type: 'info' })
    
    const bNome = filterBarbeiroId === 'all' ? 'GERAL' : filtered[0]?.barbeiros?.nome
    let text = `📋 *AGENDA ${bNome}: ${format(new Date(date + 'T12:00:00'), 'dd/MM/yyyy')}*\n\n`
    
    filtered.forEach(a => {
      const cleanPhone = a.cliente_whatsapp.replace(/\D/g, '')
      const waLink = `https://wa.me/55${cleanPhone}`
      text += `⏰ ${a.hora} - *${a.cliente_nome}*\n✂️ ${a.servico_nome}${filterBarbeiroId === 'all' ? ` (💈 ${a.barbeiros?.nome})` : ''}\n📱 Whats: ${waLink}\n-------------------\n`
    })

    const phone = whatsappCentral.replace(/\D/g, '')
    window.open(`https://wa.me/${phone.startsWith('55') ? phone : '55'+phone}?text=${encodeURIComponent(text)}`)
  }

  const handleShareEspera = () => {
    if (listaEspera.length === 0) return setModal({ show: true, title: 'Lista Vazia', message: 'Ninguém na espera para este dia.', type: 'info' })
    let text = `⏳ *LISTA DE ESPERA: ${format(new Date(date + 'T12:00:00'), 'dd/MM/yyyy')}*\n\n`
    listaEspera.forEach(e => {
      const cleanPhone = e.cliente_whatsapp.replace(/\D/g, '')
      const waLink = `https://wa.me/55${cleanPhone}`
      text += `👤 *${e.cliente_nome}*\n💈 Barbeiro: ${e.barbeiros?.nome}\n📱 Contato: ${waLink}\n-------------------\n`
    })
    const phone = whatsappCentral.replace(/\D/g, '')
    window.open(`https://wa.me/${phone.startsWith('55') ? phone : '55'+phone}?text=${encodeURIComponent(text)}`)
  }

  const handleDeleteAppointment = async (id) => {
    if (confirm('Deseja realmente excluir este agendamento? O horário voltará a ficar livre no site.')) {
      await supabase.from('agendamentos').delete().eq('id', id)
      fetchData()
    }
  }

  const handleEditAppointment = (app) => {
    setEditMode(true)
    setEditingId(app.id)
    const existingClient = clientes.find(c => c.whatsapp === app.cliente_whatsapp)
    setManualBooking({
      barbeiro_id: app.barbeiro_id,
      servico_id: app.servico_id,
      data: app.data,
      hora: app.hora,
      cliente_id: existingClient ? existingClient.id : 'new',
      cliente_nome: app.cliente_nome,
      cliente_whatsapp: app.cliente_whatsapp
    })
    setShowAddManual(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleAddManualBooking = async () => {
    setLoading(true)
    try {
      const barberId = manualBooking.barbeiro_id
      const dataAg = manualBooking.data
      const horaAg = manualBooking.hora
      const serv = servicos.find(s => s.id === manualBooking.servico_id)
      const duracao = serv ? serv.duracao_minutos : 30
      const horaFimAg = format(addMinutes(parse(horaAg, 'HH:mm', new Date()), duracao), 'HH:mm')
      const diaSemana = getDay(new Date(dataAg + 'T12:00:00'))

      const { data: dayBlocked } = await supabase.from('bloqueios').select('id').eq('barbeiro_id', barberId).eq('data', dataAg).maybeSingle()
      if (dayBlocked) { setLoading(false); return setModal({ show: true, title: 'Dia Bloqueado', message: 'Este barbeiro não atenderá nesta data.', type: 'error' }) }

      const { data: hourBlocked } = await supabase.from('bloqueios_horarios').select('id').eq('barbeiro_id', barberId).eq('data', dataAg).eq('hora', horaAg).maybeSingle()
      if (hourBlocked) { setLoading(false); return setModal({ show: true, title: 'Horário Bloqueado', message: 'Este horário foi bloqueado manualmente.', type: 'error' }) }

      const { data: existing } = await supabase.from('agendamentos').select('id, cliente_nome, hora, hora_fim').eq('barbeiro_id', barberId).eq('data', dataAg).neq('id', editingId || '0')
      const conflict = existing?.find(a => (horaAg < a.hora_fim && horaFimAg > a.hora))
      if (conflict) { setLoading(false); return setModal({ show: true, title: 'Conflito de Agenda', message: `Já existe um agendamento para ${conflict.cliente_nome} neste horário.`, type: 'error' }) }

      const { data: exp } = await supabase.from('expediente').select('*').eq('barbeiro_id', barberId).eq('dia_semana', diaSemana).eq('is_aberto', true).maybeSingle()
      if (!exp) { setLoading(false); return setModal({ show: true, title: 'Fora do Expediente', message: 'O barbeiro selecionado não trabalha neste dia.', type: 'warning' }) }

      let nome = manualBooking.cliente_nome
      let whats = manualBooking.cliente_whatsapp
      if (manualBooking.cliente_id !== 'new') {
        const c = clientes.find(cli => cli.id === manualBooking.cliente_id)
        nome = c.nome
        whats = c.whatsapp
      }

      const payload = {
        cliente_nome: nome,
        cliente_whatsapp: whats,
        barbeiro_id: barberId,
        servico_id: manualBooking.servico_id,
        servico_nome: serv ? serv.nome : 'Serviço Manual',
        duracao_servico: duracao,
        data: dataAg,
        hora: manualBooking.hora,
        hora_fim: horaFimAg,
        status: 'confirmado'
      }

      let error
      if (editMode) {
        const res = await supabase.from('agendamentos').update(payload).eq('id', editingId)
        error = res.error
      } else {
        const res = await supabase.from('agendamentos').insert([payload])
        error = res.error
      }

      if (!error) {
        if (manualBooking.cliente_id === 'new') await supabase.from('clientes').upsert({ whatsapp: whats, nome: nome })
        setShowAddManual(false); setEditMode(false); setEditingId(null); fetchData()
        setModal({ show: true, title: 'Sucesso', message: editMode ? 'Agendamento atualizado!' : 'Agendamento manual realizado!', type: 'success' })
      }
    } catch (err) {
      console.error(err)
      setModal({ show: true, title: 'Erro Interno', message: 'Ocorreu uma falha ao validar o agendamento.', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const deleteBloqueioDia = async (id) => { await supabase.from('bloqueios').delete().eq('id', id); fetchData(); }
  const deleteBloqueioHora = async (id) => { await supabase.from('bloqueios_horarios').delete().eq('id', id); fetchData(); }
  const handleAddBloqueioDia = async () => { await supabase.from('bloqueios').insert([{ barbeiro_id: selectedBarbeiro, data: date }]); fetchData(); }
  
  const handleAddBloqueioRange = async () => {
    if (!bloqueioRange.inicio || !bloqueioRange.fim) return setModal({ show: true, title: 'Atenção', message: 'Escolha o início e o fim.', type: 'warning' });
    let current = parse(bloqueioRange.inicio, 'HH:mm', new Date())
    const end = parse(bloqueioRange.fim, 'HH:mm', new Date())
    const slotsToBlock = []
    while (isBefore(current, end)) {
      slotsToBlock.push({ barbeiro_id: selectedBarbeiro, data: date, hora: format(current, 'HH:mm') })
      current = addMinutes(current, 10)
    }
    if (slotsToBlock.length > 0) {
      await supabase.from('bloqueios_horarios').insert(slotsToBlock); fetchData()
      setModal({ show: true, title: 'Sucesso', message: 'Intervalo bloqueado!', type: 'success' })
    }
  }

  const handleSaveBulkExpediente = async () => {
    setLoading(true)
    try {
      await supabase.from('expediente').delete().eq('barbeiro_id', selectedBarbeiro)
      const allDaysData = [0, 1, 2, 3, 4, 5, 6].map(dia => ({
        barbeiro_id: selectedBarbeiro,
        dia_semana: dia,
        inicio_1: bulkHours.inicio_1,
        fim_1: bulkHours.fim_1,
        inicio_2: bulkHours.inicio_2,
        fim_2: bulkHours.fim_2,
        is_aberto: selectedDays.includes(dia)
      }))
      await supabase.from('expediente').insert(allDaysData)
      setModal({ show: true, title: 'Sucesso', message: 'Expediente atualizado!', type: 'success' })
      fetchData()
    } catch (err) {
      setModal({ show: true, title: 'Erro', message: 'Não foi possível salvar.', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleSaveConfig = async () => {
    setSavingConfig(true)
    const { error } = await supabase.from('configuracoes').upsert({ id: 'config', whatsapp_central: whatsappCentral, aviso_texto: avisoTexto })
    setSavingConfig(false)
    if (!error) setModal({ show: true, title: 'Sucesso', message: 'Ajustes salvos!', type: 'success' })
  }

  return (
    <div className="container animate-fade-in">
      {modal.show && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1.5rem' }}>
          <div className="card animate-fade-in" style={{ maxWidth: '400px', width: '100%', textAlign: 'center', position: 'relative', border: `1px solid ${modal.type === 'error' || modal.type === 'warning' ? 'var(--danger)' : 'var(--primary)'}` }}>
            <div style={{ marginBottom: '1rem' }}>
              {modal.type === 'error' || modal.type === 'warning' ? <AlertTriangle size={50} color="var(--danger)" style={{ margin: '0 auto' }} /> : <Check size={50} color="var(--primary)" style={{ margin: '0 auto' }} />}
            </div>
            <h3 style={{ marginBottom: '0.5rem' }}>{modal.title}</h3>
            <p style={{ opacity: 0.8, marginBottom: '1.5rem', fontSize: '0.9rem' }}>{modal.message}</p>
            <button onClick={() => setModal({ ...modal, show: false })} className="btn btn-primary">Entendido</button>
          </div>
        </div>
      )}

      <header className="mb-6">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1>Painel Admin</h1>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Link to="/" className="btn btn-outline" style={{ width: 'auto' }}>Ver Site</Link>
            <button onClick={handleLogout} className="btn btn-outline" style={{ width: 'auto', borderColor: 'var(--danger)', color: 'var(--danger)' }}>
              <LogOut size={18} /> Sair
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1.5rem' }}>
          <button onClick={() => setTab('agenda')} className={`btn ${tab === 'agenda' ? 'btn-primary' : 'btn-outline'}`} style={{ width: 'auto', padding: '0.6rem 1rem' }}>📋 Agenda</button>
          <button onClick={() => setTab('espera')} className={`btn ${tab === 'espera' ? 'btn-primary' : 'btn-outline'}`} style={{ width: 'auto', padding: '0.6rem 1rem' }}>⏳ Espera</button>
          <button onClick={() => setTab('clientes')} className={`btn ${tab === 'clientes' ? 'btn-primary' : 'btn-outline'}`} style={{ width: 'auto', padding: '0.6rem 1rem' }}>👥 Clientes</button>
          <button onClick={() => setTab('servicos')} className={`btn ${tab === 'servicos' ? 'btn-primary' : 'btn-outline'}`} style={{ width: 'auto', padding: '0.6rem 1rem' }}>✂️ Serviços</button>
          <button onClick={() => setTab('barbeiros')} className={`btn ${tab === 'barbeiros' ? 'btn-primary' : 'btn-outline'}`} style={{ width: 'auto', padding: '0.6rem 1rem' }}>🧔 Barbeiros</button>
          <button onClick={() => setTab('expediente')} className={`btn ${tab === 'expediente' ? 'btn-primary' : 'btn-outline'}`} style={{ width: 'auto', padding: '0.6rem 1rem' }}>📅 Expediente</button>
          <button onClick={() => setTab('bloqueios')} className={`btn ${tab === 'bloqueios' ? 'btn-primary' : 'btn-outline'}`} style={{ width: 'auto', padding: '0.6rem 1rem' }}>🚫 Bloqueios</button>
          <button onClick={() => setTab('ajustes')} className={`btn ${tab === 'ajustes' ? 'btn-primary' : 'btn-outline'}`} style={{ width: 'auto', padding: '0.6rem 1rem' }}>⚙️ Ajustes</button>
        </div>
      </header>

      {tab === 'agenda' && (
        <div className="animate-fade-in">
          <div className="card mb-4">
            <h3 className="mb-2">📅 Gestão da Agenda</h3>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ flex: '1 1 150px' }} />
              <select value={filterBarbeiroId} onChange={e => setFilterBarbeiroId(e.target.value)} style={{ flex: '1 1 150px' }}>
                <option value="all">👥 Todos os Barbeiros</option>
                {barbeiros.map(b => <option key={b.id} value={b.id}>💈 {b.nome}</option>)}
              </select>
              <button onClick={() => { setEditMode(false); setShowAddManual(!showAddManual) }} className="btn btn-outline" style={{ width: 'auto', background: 'rgba(212,175,55,0.1)' }}><PlusCircle size={18} /> Novo</button>
              <button onClick={handleShareAgenda} className="btn btn-primary" style={{ background: '#25d366', color: 'white', width: 'auto' }}><Share2 size={18} /> WhatsApp</button>
            </div>
          </div>
          {showAddManual && (
            <div className="card animate-fade-in" style={{ border: '1px solid var(--primary)', background: 'rgba(212,175,55,0.02)' }}>
              <h3>{editMode ? '✏️ Editar' : '➕ Novo Agendamento'}</h3>
              <div className="grid-2 mb-4">
                <select value={manualBooking.barbeiro_id} onChange={e => setManualBooking({...manualBooking, barbeiro_id: e.target.value})}>{barbeiros.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}</select>
                <select value={manualBooking.servico_id} onChange={e => setManualBooking({...manualBooking, servico_id: e.target.value})}>{servicos.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}</select>
              </div>
              <div className="mb-4">
                <input type="date" value={manualBooking.data} onChange={e => setManualBooking({...manualBooking, data: e.target.value, hora: ''})} className="mb-3" />
                {manualSlotsLoading ? (
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>🔍 Buscando horários disponíveis...</p>
                ) : manualSlots.length === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: 'var(--danger)', textAlign: 'center' }}>⚠️ Sem horários disponíveis para este barbeiro nesta data.</p>
                ) : (
                  <>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Selecione o horário:</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem' }}>
                      {manualSlots.map(slot => (
                        <button key={slot} onClick={() => setManualBooking({...manualBooking, hora: slot})} className={`btn ${manualBooking.hora === slot ? 'btn-primary' : 'btn-outline'}`} style={{ padding: '0.4rem', fontSize: '0.8rem' }}>{slot}</button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div className="card" style={{ background: 'rgba(255,255,255,0.02)', margin: '0 0 1.5rem' }}>
                <select className="mb-3" value={manualBooking.cliente_id} onChange={e => setManualBooking({...manualBooking, cliente_id: e.target.value})}>
                  <option value="new">+ Novo Cliente</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nome} ({formatPhone(c.whatsapp)})</option>)}
                </select>
                {manualBooking.cliente_id === 'new' && (
                  <div className="grid-2"><input placeholder="Nome" value={manualBooking.cliente_nome} onChange={e => setManualBooking({...manualBooking, cliente_nome: e.target.value})} /><input placeholder="WhatsApp" value={formatPhone(manualBooking.cliente_whatsapp)} onChange={e => setManualBooking({...manualBooking, cliente_whatsapp: e.target.value.replace(/\D/g, '').slice(0, 11)})} /></div>
                )}
              </div>
              <button onClick={handleAddManualBooking} className="btn btn-primary" disabled={loading}>{loading ? 'Salvando...' : 'Salvar'}</button>
            </div>
          )}
          {(filterBarbeiroId === 'all' ? appointments : appointments.filter(a => a.barbeiro_id === filterBarbeiroId)).length === 0
            ? <p className="text-center py-6 opacity-50">Nenhum agendamento.</p>
            : (filterBarbeiroId === 'all' ? appointments : appointments.filter(a => a.barbeiro_id === filterBarbeiroId)).map(a => (
            <div key={a.id} className="card" style={{ borderLeft: '4px solid var(--primary)', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>{a.hora} - {a.cliente_nome}</strong>
                  <p style={{ margin: '4px 0' }}>{a.servico_nome} | 💈 {a.barbeiros?.nome}</p>
                  <p style={{ margin: '2px 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>📱 {formatPhone(a.cliente_whatsapp)}</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => handleEditAppointment(a)} className="btn btn-outline" style={{ width: 'auto', padding: '0.5rem', borderColor: 'var(--primary)' }}><Pencil size={18} color="var(--primary)" /></button>
                  <button onClick={() => window.open(`https://wa.me/55${a.cliente_whatsapp.replace(/\D/g, '')}`)} className="btn btn-outline" style={{ width: 'auto', padding: '0.5rem', borderColor: '#25d366' }}><MessageCircle size={18} color="#25d366" /></button>
                  <button onClick={() => handleDeleteAppointment(a.id)} className="btn btn-outline" style={{ width: 'auto', padding: '0.5rem', borderColor: 'var(--danger)' }}><Trash2 size={18} color="var(--danger)" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'espera' && (
        <div className="animate-fade-in">
          <div className="card mb-4">
            <h3>⏳ Lista de Espera ({listaEspera.length})</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Clientes que tentaram marcar hoje, mas a agenda estava lotada.</p>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginTop: '1rem' }}>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ flex: '1 1 200px' }} />
              <button onClick={handleShareEspera} className="btn btn-primary" style={{ background: '#25d366', color: 'white', width: 'auto' }}>
                <Share2 size={18} /> Enviar p/ WhatsApp
              </button>
            </div>
          </div>
          {listaEspera.length === 0 ? <p className="text-center py-6 opacity-50">Ninguém na espera para este dia.</p> : listaEspera.map(e => (
            <div key={e.id} className="card" style={{ borderLeft: '4px solid var(--warning)', marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>{e.cliente_nome}</strong>
                <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>Pretendia: 💈 {e.barbeiros?.nome}</p>
                <p style={{ fontSize: '0.8rem' }}><Phone size={12} /> {formatPhone(e.cliente_whatsapp)}</p>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => {
                  const msg = `Oi ${e.cliente_nome}, você entrou na lista de espera para o dia ${format(new Date(e.data + 'T12:00:00'), 'dd/MM')}. Acabou de surgir uma vaga! Ainda tem interesse?`
                  window.open(`https://wa.me/55${e.cliente_whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`)
                }} className="btn btn-primary" style={{ background: '#25d366', borderColor: '#25d366', width: 'auto' }}><MessageCircle size={18} /> Avisar Vaga</button>
                <button onClick={async () => { await supabase.from('lista_espera').delete().eq('id', e.id); fetchData(); }} className="btn btn-outline" style={{ borderColor: 'var(--danger)', width: 'auto' }}><Trash2 size={18} color="var(--danger)" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'clientes' && (
        <div className="animate-fade-in">
          <div className="card mb-4"><h3>👥 Base de Clientes ({clientes.length})</h3></div>
          {clientes.map(c => (
            <div key={c.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div><strong>{c.nome}</strong><p style={{ fontSize: '0.9rem' }}>{formatPhone(c.whatsapp)}</p></div>
              <button onClick={() => window.open(`https://wa.me/55${c.whatsapp}`)} className="btn btn-outline" style={{ width: 'auto', padding: '0.5rem' }}><MessageCircle size={18} color="#25d366" /></button>
            </div>
          ))}
        </div>
      )}

      {tab === 'servicos' && (
        <div className="animate-fade-in">
          <div className="card">
            <h3>✂️ Serviços</h3>
            <input placeholder="Nome" id="sn" className="mb-2" /><input type="number" placeholder="Minutos" id="sd" className="mb-4" />
            <button onClick={async () => {
               const n = document.getElementById('sn').value; const d = document.getElementById('sd').value;
               if(!n || !d) return; await supabase.from('servicos').insert([{ nome: n, duracao_minutos: parseInt(d) }]); fetchData();
               document.getElementById('sn').value = ''; document.getElementById('sd').value = '';
            }} className="btn btn-primary"><Plus /> Adicionar</button>
          </div>
          {servicos.map(s => (
            <div key={s.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <strong>{s.nome} ({s.duracao_minutos} min)</strong>
              <Trash2 size={18} onClick={async () => { 
                if(confirm(`Deseja excluir o serviço ${s.nome}?`)) { 
                  const today = format(new Date(), 'yyyy-MM-dd')
                  
                  // 1. Buscar agendamentos futuros para este serviço
                  const { data: future } = await supabase
                    .from('agendamentos')
                    .select('cliente_nome, data, hora')
                    .eq('servico_id', s.id)
                    .gte('data', today)

                  if (future && future.length > 0) {
                    const list = future.map(f => `• ${f.cliente_nome} (${format(new Date(f.data + 'T12:00:00'), 'dd/MM')} às ${f.hora})`).join('\n')
                    setModal({ 
                      show: true, 
                      title: 'Exclusão Bloqueada', 
                      message: `Este serviço não pode ser excluído pois existem ${future.length} agendamentos futuros:\n\n${list}\n\nRemaneje estes clientes antes de excluir o serviço.`, 
                      type: 'warning' 
                    })
                  } else {
                    // 2. Se só houver passado, desvincular o ID para permitir a exclusão (o nome continua salvo no agendamento)
                    await supabase.from('agendamentos').update({ servico_id: null }).eq('servico_id', s.id)
                    const { error } = await supabase.from('servicos').delete().eq('id', s.id)
                    if (!error) fetchData()
                    else setModal({ show: true, title: 'Erro', message: 'Falha ao excluir serviço.', type: 'error' })
                  }
                } 
              }} style={{ cursor: 'pointer', color: 'var(--danger)' }} />
            </div>
          ))}
        </div>
      )}

      {tab === 'barbeiros' && (
        <div className="animate-fade-in">
          <div className="card">
            <h3>🧔 Profissionais</h3>
            <p className="mb-4" style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Gerencie sua equipe de barbeiros.</p>
            <input placeholder="Nome do Barbeiro" id="bn" className="mb-4" />
            <button onClick={async () => {
               const n = document.getElementById('bn').value; if(!n) return;
               await supabase.from('barbeiros').insert([{ nome: n }]); fetchData();
               document.getElementById('bn').value = '';
            }} className="btn btn-primary"><UserPlus /> Adicionar Profissional</button>
          </div>
          {barbeiros.map(b => (
            <div key={b.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <strong>{b.nome}</strong>
              <Trash2 size={18} onClick={async () => { 
                if(confirm(`Remover o barbeiro ${b.nome}?`)) { 
                  const today = format(new Date(), 'yyyy-MM-dd')
                  
                  // 1. Buscar agendamentos futuros para este barbeiro
                  const { data: future } = await supabase
                    .from('agendamentos')
                    .select('cliente_nome, data, hora')
                    .eq('barbeiro_id', b.id)
                    .gte('data', today)

                  if (future && future.length > 0) {
                    const list = future.map(f => `• ${f.cliente_nome} (${format(new Date(f.data + 'T12:00:00'), 'dd/MM')} às ${f.hora})`).join('\n')
                    setModal({ 
                      show: true, 
                      title: 'Barbeiro com Agenda', 
                      message: `Este profissional tem ${future.length} agendamentos futuros:\n\n${list}\n\nCancele ou mude o barbeiro desses clientes antes de removê-lo.`, 
                      type: 'warning' 
                    })
                  } else {
                    // 2. Desvincular passados e expediente e deletar
                    await supabase.from('agendamentos').update({ barbeiro_id: null }).eq('barbeiro_id', b.id)
                    await supabase.from('expediente').delete().eq('barbeiro_id', b.id)
                    await supabase.from('bloqueios').delete().eq('barbeiro_id', b.id)
                    await supabase.from('bloqueios_horarios').delete().eq('barbeiro_id', b.id)
                    await supabase.from('lista_espera').delete().eq('barbeiro_id', b.id)
                    const { error } = await supabase.from('barbeiros').delete().eq('id', b.id)
                    if (!error) fetchData()
                    else setModal({ show: true, title: 'Erro', message: 'Falha ao remover barbeiro.', type: 'error' })
                  }
                } 
              }} style={{ color: 'var(--danger)', cursor: 'pointer' }} />
            </div>
          ))}
        </div>
      )}

      {tab === 'expediente' && (
        <div className="animate-fade-in">
          <div className="card">
            <h3>📅 Expediente</h3>
            <select value={selectedBarbeiro} onChange={e => setSelectedBarbeiro(e.target.value)} className="mb-6">{barbeiros.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}</select>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginBottom: '1.5rem' }}>
              {DIAS_SEMANA.map((dia, idx) => (<button key={idx} onClick={() => selectedDays.includes(idx) ? setSelectedDays(selectedDays.filter(d => d !== idx)) : setSelectedDays([...selectedDays, idx])} className={`btn ${selectedDays.includes(idx) ? 'btn-primary' : 'btn-outline'}`} style={{ padding: '0.5rem', fontSize: '0.75rem' }}>{dia}</button>))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div className="card" style={{ margin: 0, padding: '1rem' }}>
                <label>🌅 TURNO 1</label>
                <div style={{ display: 'flex', gap: '8px' }}><input type="time" value={bulkHours.inicio_1} onChange={e => setBulkHours({...bulkHours, inicio_1: e.target.value})} /><input type="time" value={bulkHours.fim_1} onChange={e => setBulkHours({...bulkHours, fim_1: e.target.value})} /></div>
              </div>
              <div className="card" style={{ margin: 0, padding: '1rem' }}>
                <label>🌇 TURNO 2</label>
                <div style={{ display: 'flex', gap: '8px' }}><input type="time" value={bulkHours.inicio_2} onChange={e => setBulkHours({...bulkHours, inicio_2: e.target.value})} /><input type="time" value={bulkHours.fim_2} onChange={e => setBulkHours({...bulkHours, fim_2: e.target.value})} /></div>
              </div>
            </div>
            <button onClick={handleSaveBulkExpediente} className="btn btn-primary mt-6"><Save /> Salvar</button>
          </div>
        </div>
      )}

      {tab === 'bloqueios' && (
        <div className="animate-fade-in">
          <div className="card mb-6">
            <h3>🚫 Bloqueios</h3>
            <div className="grid-2 mb-4">
              <select value={selectedBarbeiro} onChange={e => setSelectedBarbeiro(e.target.value)}>{barbeiros.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}</select>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                <div className="card" style={{ margin: 0, background: 'rgba(239, 68, 68, 0.05)' }}>
                  <label>Bloquear DIA TODO</label>
                  <button onClick={handleAddBloqueioDia} className="btn btn-outline" style={{ color: 'var(--danger)', borderColor: 'var(--danger)', width: '100%' }}>Confirmar</button>
                </div>
                <div className="card" style={{ margin: 0, background: 'rgba(255, 255, 255, 0.02)' }}>
                  <label>Bloquear INTERVALO</label>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '1rem' }}>
                    <input type="time" value={bloqueioRange.inicio} onChange={e => setBloqueioRange({...bloqueioRange, inicio: e.target.value})} />
                    <span>➔</span>
                    <input type="time" value={bloqueioRange.fim} onChange={e => setBloqueioRange({...bloqueioRange, fim: e.target.value})} />
                  </div>
                  <button onClick={handleAddBloqueioRange} className="btn btn-primary" style={{ width: '100%' }}>Bloquear Período</button>
                </div>
            </div>
          </div>
          <div className="card">
            <h3>📋 Ativos</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
                {allBloqueiosDias.map(b => (
                  <div key={b.id} className="card" style={{ margin: 0, border: '1px solid var(--danger)', background: 'rgba(239, 68, 68, 0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div><strong>DIA TODO</strong><br />{format(new Date(b.data + 'T12:00:00'), 'dd/MM/yyyy')}</div>
                    <Trash2 size={16} onClick={() => deleteBloqueioDia(b.id)} style={{ cursor: 'pointer' }} />
                  </div>
                ))}
                {allBloqueiosHoras.map(bh => (
                  <div key={bh.id} style={{ background: 'rgba(255,255,255,0.05)', padding: '5px 10px', borderRadius: '5px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{bh.hora} ({format(new Date(bh.data + 'T12:00:00'), 'dd/MM')})</span>
                    <Trash2 size={14} onClick={() => deleteBloqueioHora(bh.id)} style={{ cursor: 'pointer', color: 'var(--danger)' }} />
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'ajustes' && (
        <div className="animate-fade-in">
          <div className="card">
            <h3>⚙️ Ajustes</h3>
            <label>WhatsApp Central</label>
            <input placeholder="Ex: (11) 98888-7777" value={formatPhone(whatsappCentral)} onChange={(e) => setWhatsappCentral(e.target.value.replace(/\D/g, '').slice(0, 11))} className="mb-4" />
            <label>Aviso para Clientes</label>
            <textarea placeholder="Mensagem da tela inicial..." value={avisoTexto} onChange={(e) => setAvisoTexto(e.target.value)} rows={3} style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', color: 'white' }} />
            <button onClick={handleSaveConfig} className="btn btn-primary mt-6" disabled={savingConfig}><Save size={18} /> Salvar</button>
          </div>
        </div>
      )}
      <style dangerouslySetInnerHTML={{ __html: `.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; } @media (max-width: 768px) { .grid-2 { grid-template-columns: 1fr; } }`}} />
    </div>
  )
}
