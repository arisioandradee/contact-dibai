import React, { useState, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import {
    Upload,
    History,
    FileText,
    Sparkles,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Calendar,
    ChevronRight,
    ArrowLeft,
    Check,
    Trash2,
    Cloud,
    LayoutDashboard,
    PlusCircle,
    User,
    Phone,
    Building2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const FIXED_CLIENT_TOKEN = import.meta.env.VITE_Z_API_CLIENT_TOKEN || 'F76cf304687e3484b95580c584a3bfe9aS';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://supabase2.dibaisales.com.br';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
        if (typeof dateStr === 'string' && dateStr.includes('/') && dateStr.includes(',')) {
            const [datePart, timePart] = dateStr.split(', ');
            const [day, month, year] = datePart.split('/');
            const isoStr = `${year}-${month}-${day}T${timePart.trim()}`;
            const d = new Date(isoStr);
            if (!isNaN(d.getTime())) return d.toLocaleString('pt-BR');
        }

        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;

        return d.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return dateStr;
    }
};

function App() {
    const [contacts, setContacts] = useState([]);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [status, setStatus] = useState({ type: '', message: '' });
    const [view, setView] = useState('importacao'); // 'importacao' or 'history'
    const [history, setHistory] = useState([]);
    const [selectedHistory, setSelectedHistory] = useState(null);
    const [spreadsheetType, setSpreadsheetType] = useState('melhor_lead'); // 'melhor_lead', 'modelo_basico', or 'manual'
    const [manualMode, setManualMode] = useState('individual'); // 'individual' or 'bulk'
    const [customMessage, setCustomMessage] = useState('');
    const [manualContact, setManualContact] = useState({ nome_socio: '', whatsapp_socio: '', nome_empresa: '' });
    const [bulkNames, setBulkNames] = useState('');
    const [bulkCompanies, setBulkCompanies] = useState('');
    const [bulkPhones, setBulkPhones] = useState('');

    const DEFAULT_MESSAGES = {
        melhor_lead: `Olá! Tudo bem? Neste número falo com {{nome}}?\n\nRecebi seu contato para entender melhor sobre o produto de tecnologia de vocês e como funciona hoje.`,
        modelo_basico: `Oi, {{nome}}! Tudo Bem?\nVocê chegou a conversar com o Daniel da Nexus há um tempo sobre geração de leads, mas o projeto não seguiu na época.\n\nDe lá pra cá, mudou algo na estratégia comercial de vocês?\nSe fizer sentido, posso te atualizar rapidamente sobre o que estamos fazendo hoje.`,
        manual: `Olá! Tudo bem? Neste número falo com {{nome}}?`
    };

    const fetchHistory = async () => {
        const localData = JSON.parse(localStorage.getItem('disparo_history') || '[]');
        try {
            const { data, error } = await supabase
                .from('wa_envios_per')
                .select('*')
                .order('timestamp', { ascending: false });

            if (error) throw error;

            if (data && data.length > 0) {
                const sanitizedCloud = data.map(item => ({
                    ...item,
                    contacts: Array.isArray(item.contacts) ? item.contacts : []
                }));
                const combinedMap = new Map();
                localData.forEach(item => { if (item.id) combinedMap.set(item.id.toString(), item); });
                sanitizedCloud.forEach(item => { if (item.id) combinedMap.set(item.id.toString(), item); });
                const mergedHistory = Array.from(combinedMap.values()).sort((a, b) => {
                    return new Date(b.timestamp || b.created_at) - new Date(a.timestamp || a.created_at);
                });
                setHistory(mergedHistory);
                localStorage.setItem('disparo_history', JSON.stringify(mergedHistory));
            } else {
                setHistory(localData);
            }
        } catch (e) {
            setHistory(localData);
        }
    };

    useEffect(() => {
        fetchHistory();
    }, []);

    useEffect(() => {
        setCustomMessage(DEFAULT_MESSAGES[spreadsheetType] || '');
    }, [spreadsheetType]);

    const saveToHistory = async (newEntry) => {
        const entryToSave = { ...newEntry, id: newEntry.id || Date.now() };
        const updatedHistory = [entryToSave, ...history];
        setHistory(updatedHistory);
        localStorage.setItem('disparo_history', JSON.stringify(updatedHistory));

        try {
            const { error: rpcError } = await supabase.rpc('save_history_v3', {
                payload: {
                    total: newEntry.total,
                    success: newEntry.success,
                    error: newEntry.error,
                    contacts: newEntry.contacts
                }
            });
            if (rpcError) {
                await supabase.from('wa_envios_per').insert([{
                    total: newEntry.total,
                    success: newEntry.success,
                    error: newEntry.error,
                    contacts: newEntry.contacts
                }]);
            }
        } catch (e) { }
    };

    const handleClearHistory = async () => {
        if (!window.confirm('Tem certeza que deseja limpar todo o histórico? Esta ação é irreversível.')) return;
        setLoading(true);
        try {
            localStorage.removeItem('disparo_history');
            const { error } = await supabase.from('wa_envios_per').delete().neq('id', 0);
            if (error) throw error;
            setHistory([]);
            setStatus({ type: 'success', message: 'Histórico limpo com sucesso!' });
        } catch (e) {
            setHistory([]); // Limpa local mesmo se falhar nuvem
            setStatus({ type: 'error', message: 'Histórico local limpo, mas erro ao limpar nuvem.' });
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setLoading(true);
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const data = XLSX.utils.sheet_to_json(wb.Sheets[wsname]);
                let mapped;
                if (spreadsheetType === 'melhor_lead') {
                    mapped = data.map((row, index) => ({
                        id: index,
                        nome_socio: row.whatsapp_socio_nome || row.nome_socio || 'N/A',
                        whatsapp_socio: row.whatsapp_socio || '',
                        nome_empresa: row.nome_fantasia || row.nome_empresa || 'N/A',
                        status: 'pending'
                    })).filter(c => c.whatsapp_socio);
                } else {
                    // Modelo Básico (handles both original and Inlead-style columns)
                    mapped = data.map((row, index) => ({
                        id: index,
                        nome_socio: row.Nome || row.nome || 'N/A',
                        whatsapp_socio: row.Numero || row.numero || row.WhatsApp || row.whatsapp || '',
                        nome_empresa: row.Canal || row.canal || 'N/A',
                        status: 'pending'
                    })).filter(c => c.whatsapp_socio);
                }
                setContacts(mapped);
                setSelectedIds(new Set(mapped.map(c => c.id)));
            } catch (err) {
                setStatus({ type: 'error', message: 'Erro no arquivo.' });
            } finally { setLoading(false); }
        };
        reader.readAsBinaryString(file);
    };

    const sendMessages = async () => {
        const selected = contacts.filter(c => selectedIds.has(c.id));
        if (selected.length === 0) return;
        setSending(true);
        let sCount = 0; let eCount = 0;
        const results = [];

        for (const contact of selected) {
            setContacts(curr => curr.map(c => c.id === contact.id ? { ...c, status: 'sending' } : c));
            try {
                let phone = contact.whatsapp_socio.toString().replace(/\D/g, '');
                if (phone.length === 10 || phone.length === 11) phone = '55' + phone;
                const instanceId = import.meta.env.VITE_Z_API_INSTANCE_ID || '3EEA3D99189391BBC88ABED0B6A7ED81';
                const token = import.meta.env.VITE_Z_API_TOKEN || '6B110D271420AD0C3E76AA6E';

                let message = customMessage
                    .replace(/{{nome}}/g, contact.nome_socio)
                    .replace(/{{empresa}}/g, contact.nome_empresa);

                const response = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Client-Token': FIXED_CLIENT_TOKEN },
                    body: JSON.stringify({ phone, message })
                });
                if (response.ok) {
                    sCount++; results.push({ ...contact, status: 'success' });
                    setContacts(curr => curr.map(c => c.id === contact.id ? { ...c, status: 'success' } : c));
                } else {
                    eCount++; results.push({ ...contact, status: 'error' });
                    setContacts(curr => curr.map(c => c.id === contact.id ? { ...c, status: 'error' } : c));
                }
            } catch (err) {
                eCount++; results.push({ ...contact, status: 'error' });
                setContacts(curr => curr.map(c => c.id === contact.id ? { ...c, status: 'error' } : c));
            }
            await new Promise(r => setTimeout(r, 1000));
        }
        saveToHistory({ id: Date.now(), timestamp: new Date().toISOString(), total: selected.length, success: sCount, error: eCount, contacts: results });
        setSending(false);
        setStatus({ type: sCount > 0 ? 'success' : 'error', message: `Finalizado. Sucesso: ${sCount}, Falha: ${eCount}` });
    };

    const syncResponses = async () => {
        if (!selectedHistory) return;
        setSyncing(true);
        const contactsArray = Array.isArray(selectedHistory.contacts) ? selectedHistory.contacts : [];
        const updated = [...contactsArray];
        let changed = false;
        try {
            const searchVariants = [];
            updated.forEach(c => {
                let p = c.whatsapp_socio.toString().replace(/\D/g, '');
                if (p.startsWith('55')) p = p.substring(2);
                if (p.length === 11 && p[2] === '9') {
                    const with9 = '55' + p;
                    const without9 = '55' + p.substring(0, 2) + p.substring(3);
                    searchVariants.push(with9, without9);
                } else if (p.length === 10) {
                    const without9 = '55' + p;
                    const with9 = '55' + p.substring(0, 2) + '9' + p.substring(2);
                    searchVariants.push(without9, with9);
                } else {
                    searchVariants.push('55' + p);
                }
            });

            const { data } = await supabase.from('wa_disparo_respostas')
                .select('phone, text_content')
                .in('phone', searchVariants)
                .order('received_at', { ascending: false });

            if (data) {
                for (let i = 0; i < updated.length; i++) {
                    const cleanExcelPhone = updated[i].whatsapp_socio.toString().replace(/\D/g, '');
                    const excelSuffix = cleanExcelPhone.slice(-8);
                    const contactData = data.filter(r => {
                        const cleanDbPhone = r.phone.replace(/\D/g, '');
                        return cleanDbPhone.endsWith(excelSuffix);
                    });

                    if (contactData.length > 0) {
                        const hasSim = contactData.some(r => r.text_content.toLowerCase().includes('sim'));
                        const hasNao = contactData.some(r => r.text_content.toLowerCase().includes('não') || r.text_content.toLowerCase().includes('nao'));
                        const lastResp = contactData[0];

                        if (hasSim) { updated[i].status = 'confirmed'; changed = true; }
                        else if (hasNao) { updated[i].status = 'denied'; changed = true; }
                        updated[i].response = lastResp.text_content;
                    }
                }
            }
        } catch (e) { }
        if (changed) {
            const updatedHistory = history.map(h => h.id === selectedHistory.id ? { ...h, contacts: updated } : h);
            setHistory(updatedHistory);
            localStorage.setItem('disparo_history', JSON.stringify(updatedHistory));
            setSelectedHistory({ ...selectedHistory, contacts: updated });
            try {
                await supabase.from('wa_envios_per').update({ contacts: updated }).eq('id', selectedHistory.id);
            } catch (e) { }
        }
        setSyncing(false);
    };

    const toggleSelect = (id) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelectedIds(next);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === contacts.length && contacts.length > 0) { setSelectedIds(new Set()); }
        else { setSelectedIds(new Set(contacts.map(c => c.id))); }
    };

    const handleCancel = (e) => {
        e.stopPropagation();
        setContacts([]);
        setSelectedIds(new Set());
        setStatus({ type: '', message: '' });
    };

    const renderBroadcastView = () => (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full pt-10 pb-20 flex flex-col items-center">
            <div className="dashboard-width mb-8">
                <div className="flex flex-col items-center space-y-4">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Tipo de Planilha</span>
                    <div className="flex bg-white/[0.03] p-1 rounded-xl border border-white/[0.05]">
                        <button
                            onClick={() => setSpreadsheetType('melhor_lead')}
                            className={`tab-btn ${spreadsheetType === 'melhor_lead' ? 'active' : ''}`}
                        >
                            Melhor Lead
                        </button>
                        <button
                            onClick={() => setSpreadsheetType('modelo_basico')}
                            className={`tab-btn ${spreadsheetType === 'modelo_basico' ? 'active' : ''}`}
                        >
                            Modelo Básico
                        </button>
                        <button
                            onClick={() => setSpreadsheetType('manual')}
                            className={`tab-btn ${spreadsheetType === 'manual' ? 'active' : ''}`}
                        >
                            <PlusCircle className="w-3.5 h-3.5 mr-1" /> Manual
                        </button>
                    </div>
                </div>
            </div>

            <div className="dashboard-width">
                <div
                    className="upload-container group border-white/[0.03] bg-white/[0.01]"
                    onClick={() => spreadsheetType !== 'manual' && contacts.length === 0 && document.getElementById('file-upload').click()}
                >
                    <input id="file-upload" type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden-input" />
                    {spreadsheetType === 'manual' ? (
                        <div className="w-full space-y-8 p-6">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-4">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center border border-indigo-500/20">
                                        <PlusCircle className="w-5 h-5 text-indigo-400" />
                                    </div>
                                    <h3 className="text-xl font-black text-white italic uppercase tracking-tight">Adicionar Leads</h3>
                                </div>

                                <div className="flex bg-white/[0.03] p-1 rounded-xl border border-white/[0.05]">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setManualMode('individual'); }}
                                        className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${manualMode === 'individual' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-500 hover:text-slate-300'}`}
                                    >
                                        Individual
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setManualMode('bulk'); }}
                                        className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${manualMode === 'bulk' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-500 hover:text-slate-300'}`}
                                    >
                                        Em Massa
                                    </button>
                                </div>
                            </div>

                            {manualMode === 'individual' ? (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                            <User className="w-3 h-3" /> Nome do Sócio
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="Ex: João Silva"
                                            value={manualContact.nome_socio}
                                            onChange={(e) => setManualContact({ ...manualContact, nome_socio: e.target.value })}
                                            className="w-full bg-[#05060b] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-indigo-500/50 outline-none transition-all"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                            <Building2 className="w-3 h-3" /> Empresa
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="Ex: Minha Empresa LTDA"
                                            value={manualContact.nome_empresa}
                                            onChange={(e) => setManualContact({ ...manualContact, nome_empresa: e.target.value })}
                                            className="w-full bg-[#05060b] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-indigo-500/50 outline-none transition-all"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                            <Phone className="w-3 h-3" /> WhatsApp
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="Ex: 11999999999"
                                            value={manualContact.whatsapp_socio}
                                            onChange={(e) => setManualContact({ ...manualContact, whatsapp_socio: e.target.value })}
                                            className="w-full bg-[#05060b] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-indigo-500/50 outline-none transition-all"
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                                <User className="w-3 h-3" /> Nomes (Um por linha)
                                            </label>
                                            <textarea
                                                placeholder="João Silva&#10;Maria Santos"
                                                value={bulkNames}
                                                onChange={(e) => setBulkNames(e.target.value)}
                                                className="w-full h-60 bg-[#05060b] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-indigo-500/50 outline-none transition-all font-mono text-xs resize-none"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                                <Building2 className="w-3 h-3" /> Empresas (Um por linha)
                                            </label>
                                            <textarea
                                                placeholder="Empresa A&#10;Empresa B"
                                                value={bulkCompanies}
                                                onChange={(e) => setBulkCompanies(e.target.value)}
                                                className="w-full h-60 bg-[#05060b] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-indigo-500/50 outline-none transition-all font-mono text-xs resize-none"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                                <Phone className="w-3 h-3" /> Telefones (Um por linha)
                                            </label>
                                            <textarea
                                                placeholder="11999999999&#10;11888888888"
                                                value={bulkPhones}
                                                onChange={(e) => setBulkPhones(e.target.value)}
                                                className="w-full h-60 bg-[#05060b] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-indigo-500/50 outline-none transition-all font-mono text-xs resize-none"
                                            />
                                        </div>
                                    </div>
                                    <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest text-center">Os dados serão pareados por linha. O telefone é obrigatório.</p>
                                </div>
                            )}

                            <div className="flex justify-end pt-4">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (manualMode === 'individual') {
                                            if (!manualContact.nome_socio || !manualContact.whatsapp_socio) {
                                                setStatus({ type: 'error', message: 'Preencha Nome e WhatsApp' });
                                                return;
                                            }
                                            const newContact = { id: Date.now(), ...manualContact, status: 'pending' };
                                            setContacts(prev => [...prev, newContact]);
                                            setSelectedIds(prev => new Set([...prev, newContact.id]));
                                            setManualContact({ nome_socio: '', whatsapp_socio: '', nome_empresa: '' });
                                            setStatus({ type: 'success', message: 'Lead adicionado!' });
                                        } else {
                                            const names = bulkNames.split('\n');
                                            const companies = bulkCompanies.split('\n');
                                            const phones = bulkPhones.split('\n');

                                            const maxLines = Math.max(names.length, companies.length, phones.length);
                                            const newContacts = [];

                                            for (let i = 0; i < maxLines; i++) {
                                                const phone = (phones[i] || '').trim();
                                                if (phone) {
                                                    newContacts.push({
                                                        id: Date.now() + i,
                                                        nome_socio: (names[i] || '').trim() || 'N/A',
                                                        nome_empresa: (companies[i] || '').trim() || 'N/A',
                                                        whatsapp_socio: phone,
                                                        status: 'pending'
                                                    });
                                                }
                                            }

                                            if (newContacts.length === 0) {
                                                setStatus({ type: 'error', message: 'Nenhum lead com telefone encontrado' });
                                                return;
                                            }

                                            setContacts(prev => [...prev, ...newContacts]);
                                            setSelectedIds(prev => {
                                                const next = new Set(prev);
                                                newContacts.forEach(c => next.add(c.id));
                                                return next;
                                            });
                                            setBulkNames('');
                                            setBulkCompanies('');
                                            setBulkPhones('');
                                            setStatus({ type: 'success', message: `${newContacts.length} leads adicionados!` });
                                        }
                                    }}
                                    className="btn-primary !px-8 !py-3"
                                >
                                    <PlusCircle className="w-4 h-4" />
                                    <span className="font-black uppercase tracking-widest text-[11px]">
                                        {manualMode === 'individual' ? 'Adicionar Lead' : 'Adicionar Lista'}
                                    </span>
                                </button>
                            </div>
                        </div>
                    ) : contacts.length > 0 ? (
                        <div className="space-y-6">
                            <div className="w-14 h-14 bg-indigo-500/10 rounded-2xl flex items-center justify-center mx-auto border border-indigo-500/20">
                                <CheckCircle2 className="w-7 h-7 text-indigo-400" />
                            </div>
                            <div className="space-y-4">
                                <h3 className="text-2xl font-black text-white italic uppercase tracking-tight">{contacts.length} Leads Carregados</h3>
                                <div className="flex justify-center">
                                    <button onClick={handleCancel} className="btn-cancel">
                                        <Trash2 className="w-4 h-4" />
                                        Cancelar Importação
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="w-14 h-14 bg-white/[0.03] rounded-2xl flex items-center justify-center mx-auto border border-white/[0.05] group-hover:border-indigo-500/30 group-hover:bg-indigo-500/5 transition-all">
                                <Cloud className="w-7 h-7 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                            </div>
                            <div className="space-y-2 px-6">
                                <h3 className="text-xl font-black text-white italic uppercase tracking-tight">Upar Planilha</h3>
                                <p className="text-sm text-slate-500 font-medium">
                                    {spreadsheetType === 'melhor_lead'
                                        ? 'Arraste ou selecione sua planilha extraída na Ferramenta Melhor Lead.'
                                        : 'Arraste ou selecione sua planilha no Modelo Básico (Nome, Numero, Canal).'}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {status.message && (
                <div className="dashboard-width px-4">
                    <div className={`badge ${status.type === 'success' ? 'badge-success' : 'badge-error'} w-full justify-center p-4 !rounded-xl`}>
                        {status.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                        <span className="font-bold uppercase tracking-widest text-[10px]">{status.message}</span>
                    </div>
                </div>
            )}

            {contacts.length > 0 && (
                <div className="dashboard-width px-4 mt-8">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="card-premium overflow-hidden border-white/[0.03] bg-gradient-to-b from-white/[0.02] to-transparent"
                    >
                        <div className="p-8 md:p-10">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20">
                                        <Sparkles className="w-6 h-6 text-indigo-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-black text-white italic uppercase tracking-tight">Personalizar Mensagem</h3>
                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]">Crie um template único para seus leads</p>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <button
                                        onClick={() => setCustomMessage(prev => prev + ' {{nome}}')}
                                        className="btn-secondary !py-2 !px-4 !rounded-xl !text-[10px] !gap-2 group"
                                    >
                                        <span className="text-indigo-400 group-hover:scale-110 transition-transform">+</span>
                                        <span className="font-black uppercase tracking-widest">Nome do Sócio</span>
                                    </button>
                                    <button
                                        onClick={() => setCustomMessage(prev => prev + ' {{empresa}}')}
                                        className="btn-secondary !py-2 !px-4 !rounded-xl !text-[10px] !gap-2 group"
                                    >
                                        <span className="text-indigo-400 group-hover:scale-110 transition-transform">+</span>
                                        <span className="font-black uppercase tracking-widest">Empresa</span>
                                    </button>
                                </div>
                            </div>

                            <div className="relative group">
                                <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition duration-500"></div>
                                <textarea
                                    value={customMessage}
                                    onChange={(e) => setCustomMessage(e.target.value)}
                                    className="relative w-full min-h-[600px] bg-[#05060b]/80 border border-white/10 rounded-2xl p-10 text-2xl text-slate-100 focus:outline-none focus:border-indigo-500/30 transition-all resize-none leading-[1.8] placeholder:text-slate-700 font-medium"
                                    placeholder="Escreva sua mensagem aqui... Use {{nome}} e {{empresa}} para dados dinâmicos."
                                />
                                <div className="absolute bottom-8 right-8 text-[11px] font-black uppercase tracking-[0.3em] text-slate-500 pointer-events-none bg-[#05060b]/90 px-4 py-1.5 rounded-full backdrop-blur-md border border-white/10 shadow-2xl">
                                    Editor Smart v3
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}

            {contacts.length > 0 && (
                <div className="dashboard-width px-4">
                    <div className="card-footer py-6 border-t border-white/[0.02]">
                        <button onClick={toggleSelectAll} className="btn-secondary">
                            {selectedIds.size === contacts.length && contacts.length > 0 ? (
                                <CheckCircle2 className="w-4 h-4 text-indigo-400" />
                            ) : (
                                <div className="w-4 h-4 rounded-md border-2 border-white/20" />
                            )}
                            <span className="uppercase tracking-widest text-[11px] font-black">Selecionar Todos</span>
                        </button>

                        <button className="btn-primary" onClick={sendMessages} disabled={selectedIds.size === 0 || sending}>
                            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            <span className="uppercase tracking-[0.2em] text-[11px] font-black">Iniciar Disparos</span>
                        </button>
                    </div>
                </div>
            )}

            {contacts.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-8 dashboard-width card-premium overflow-hidden border-white/[0.03]">
                    <div className="max-h-[500px] overflow-y-auto">
                        <table className="premium-table">
                            <thead><tr><th className="w-10"></th><th>Lead / Empresa</th><th>WhatsApp</th><th className="text-right">Status</th></tr></thead>
                            <tbody>
                                {contacts.map(c => (
                                    <tr key={c.id}>
                                        <td className="w-10">
                                            <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} className="rounded border-white/10 bg-white/5" />
                                        </td>
                                        <td>
                                            <div className="font-semibold text-sm">{c.nome_socio}</div>
                                            <div className="text-[10px] text-slate-500">{c.nome_empresa}</div>
                                        </td>
                                        <td className="text-xs text-indigo-400 font-medium">{c.whatsapp_socio}</td>
                                        <td className="text-right">
                                            {c.status === 'success' && <span className="badge badge-success">Enviado</span>}
                                            {c.status === 'error' && <span className="badge badge-error">Falha</span>}
                                            {c.status === 'sending' && <Loader2 className="w-4 h-4 animate-spin text-indigo-400 inline" />}
                                            {c.status === 'pending' && <span className="text-[10px] text-slate-600 font-bold uppercase">Pendente</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </motion.div>
            )}
        </motion.div>
    );

    const renderHistoryView = () => (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full pt-10 px-4 pb-20">
            {selectedHistory ? (
                <div className="detail-container">
                    <div className="history-header-actions">
                        <button onClick={() => setSelectedHistory(null)} className="btn-back">
                            <ArrowLeft className="w-4 h-4" /> Voltar para lista
                        </button>
                        <button onClick={syncResponses} disabled={syncing} className="btn-primary py-3 px-6 text-[11px]">
                            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            Atualizar Respostas
                        </button>
                    </div>

                    <div className="card-premium overflow-hidden border-white/[0.03]">
                        <div className="p-8 md:p-10 border-b border-white/5 bg-white/[0.01]">
                            <div className="history-detail-main-info">
                                <div className="history-icon-bg"><Calendar className="w-8 h-8 text-indigo-400" /></div>
                                <div className="history-title-group">
                                    <h3>Histórico de Envios</h3>
                                    <p className="history-date-subtitle">{formatDate(selectedHistory.timestamp)}</p>
                                </div>
                            </div>
                            <div className="stats-grid">
                                <div className="stat-card stat-card-total">
                                    <div className="stat-icon-wrapper"><LayoutDashboard className="w-5 h-5" /></div>
                                    <span className="stat-label">Total Processado</span>
                                    <p className="stat-value">{selectedHistory.total || 0}</p>
                                </div>
                                <div className="stat-card stat-card-success">
                                    <div className="stat-icon-wrapper"><CheckCircle2 className="w-5 h-5" /></div>
                                    <span className="stat-label">Sucesso</span>
                                    <p className="stat-value">{selectedHistory.success || 0}</p>
                                </div>
                                <div className="stat-card stat-card-error">
                                    <div className="stat-icon-wrapper"><AlertCircle className="w-5 h-5" /></div>
                                    <span className="stat-label">Falha</span>
                                    <p className="stat-value">{selectedHistory.error || 0}</p>
                                </div>
                            </div>
                        </div>

                        <div className="max-h-[600px] overflow-y-auto">
                            <table className="premium-table">
                                <thead><tr><th>Lead / Empresa</th><th>Status de Envio</th><th className="text-right">Última Resposta</th></tr></thead>
                                <tbody>
                                    {(selectedHistory.contacts || []).map((c, i) => (
                                        <tr key={i}>
                                            <td>
                                                <div className="font-bold text-white mb-0.5">{c.nome_socio}</div>
                                                <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">{c.nome_empresa}</div>
                                            </td>
                                            <td>
                                                <div className="flex items-center">
                                                    {c.status === 'confirmed' && <span className="badge badge-success px-4 py-1.5 !rounded-lg text-[10px]">Sócio Confirmou</span>}
                                                    {c.status === 'denied' && <span className="badge badge-error px-4 py-1.5 !rounded-lg text-[10px]">Negado</span>}
                                                    {c.status === 'success' && <span className="badge badge-info px-4 py-1.5 !rounded-lg text-[10px]">Enviado</span>}
                                                    {c.status === 'error' && <span className="badge badge-error px-4 py-1.5 !rounded-lg text-[10px]">Falha</span>}
                                                </div>
                                            </td>
                                            <td className="text-right"><span className="text-xs text-slate-400 font-medium italic">{c.response || '-'}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="detail-container">
                    <div className="history-header-actions" style={{ justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
                        {history && history.length > 0 && (
                            <button onClick={handleClearHistory} className="btn-cancel" style={{ fontSize: '0.7rem', padding: '0.75rem 1.25rem' }}>
                                <Trash2 className="w-4 h-4 text-rose-500" />
                                Limpar Histórico
                            </button>
                        )}
                    </div>
                    <div className="history-list">
                        {history && history.length > 0 ? history.map((item, idx) => (
                            <div key={item.id || idx} onClick={() => setSelectedHistory(item)} className="history-item-card">
                                <div className="history-item-main">
                                    <div className="history-item-icon"><Calendar className="w-6 h-6" /></div>
                                    <div className="history-item-content">
                                        <h4>Envio {formatDate(item.timestamp)}</h4>
                                        <div className="history-item-details">
                                            <p className="history-item-subtitle">{item.total || 0} Leads</p>
                                            <div className="history-item-dot" />
                                            <p className="history-item-subtitle">Sincronizado</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="history-item-stats-strip">
                                    <div className="compact-stat compact-stat-total"><span className="compact-stat-label">Total</span><span className="compact-stat-value">{item.total || 0}</span></div>
                                    <div className="compact-stat compact-stat-success"><span className="compact-stat-label">Sucesso</span><span className="compact-stat-value">{item.success || 0}</span></div>
                                    <div className="compact-stat compact-stat-error"><span className="compact-stat-label">Falha</span><span className="compact-stat-value">{item.error || 0}</span></div>
                                </div>
                                <div className="history-item-arrow-wrapper"><ChevronRight className="w-5 h-5" /></div>
                            </div>
                        )) : (
                            <div className="col-span-full py-40 text-center opacity-20">
                                <History className="w-20 h-20 mx-auto mb-6 text-slate-500" />
                                <p className="font-black uppercase tracking-[0.4em] text-slate-400 text-sm">Nenhum Histórico Encontrado</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </motion.div>
    );

    return (
        <div id="app-container" className="relative">
            <div className="glow-spot glow-top-right" /><div className="glow-spot glow-bottom-left" />
            <header className="app-header">
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
                    <h1 className="main-title">Contact <span className="font-light opacity-30 px-1">|</span> <span className="accent-title">Dibai</span> Sales</h1>
                </motion.div>
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="tab-container">
                    <button onClick={() => setView('importacao')} className={`tab-btn ${view === 'importacao' ? 'active' : ''}`}><Upload className="w-4 h-4" /> Importação</button>
                    <button onClick={() => setView('history')} className={`tab-btn ${view === 'history' ? 'active' : ''}`}><History className="w-4 h-4" /> Histórico</button>
                </motion.div>
            </header>
            <main className="w-full flex flex-col items-center">
                {view === 'importacao' ? renderBroadcastView() : renderHistoryView()}
            </main>
        </div>
    );
}

export default App;
