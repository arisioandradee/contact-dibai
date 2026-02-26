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
    LayoutDashboard
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const FIXED_CLIENT_TOKEN = import.meta.env.VITE_Z_API_CLIENT_TOKEN || 'F76cf304687e3484b95580c584a3bfe9aS';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://supabase2.dibaisales.com.br';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
        return new Date(dateStr).toLocaleString('pt-BR', {
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

    const fetchHistory = async () => {
        // 1. Carrega o que está guardado localmente (Histórico antigo)
        const localData = JSON.parse(localStorage.getItem('disparo_history') || '[]');

        try {
            // 2. Tenta buscar o que está na nuvem
            const { data, error } = await supabase
                .from('wa_envios_per')
                .select('*')
                .order('timestamp', { ascending: false });

            if (error) throw error;

            if (data && data.length > 0) {
                // Mescla os dados (usando ID ou timestamp como critério)
                // Para simplificar, priorizamos o que vem do banco se houver dados lá
                setHistory(data);
            } else {
                setHistory(localData);
            }
        } catch (e) {
            console.warn('Usando apenas histórico local (Nuvem indisponível para leitura)');
            setHistory(localData);
        }
    };

    useEffect(() => {
        fetchHistory();
    }, []);

    const saveToHistory = async (newEntry) => {
        // 1. SALVAMENTO LOCAL IMEDIATO
        const entryToSave = { ...newEntry, id: newEntry.id || Date.now() };
        const updatedHistory = [entryToSave, ...history];
        setHistory(updatedHistory);
        localStorage.setItem('disparo_history', JSON.stringify(updatedHistory));

        // 2. TENTATIVA DE SYNC EM BACKGROUND
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
        } catch (e) {
            // Silencioso em produção para não poluir o console
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
                const mapped = data.map((row, index) => ({
                    id: index,
                    nome_socio: row.whatsapp_socio_nome || row.nome_socio || 'N/A',
                    whatsapp_socio: row.whatsapp_socio || '',
                    nome_empresa: row.nome_fantasia || row.nome_empresa || 'N/A',
                    status: 'pending'
                })).filter(c => c.whatsapp_socio);
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
                const response = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Client-Token': FIXED_CLIENT_TOKEN },
                    body: JSON.stringify({ phone, message: `Olá ${contact.nome_socio}, da ${contact.nome_empresa}?\n\nResponda Sim ou Não.` })
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
        saveToHistory({ id: Date.now(), timestamp: new Date().toLocaleString(), total: selected.length, success: sCount, error: eCount, contacts: results });
        setSending(false);
        setStatus({ type: sCount > 0 ? 'success' : 'error', message: `Finalizado. Sucesso: ${sCount}, Falha: ${eCount}` });
    };

    const syncResponses = async () => {
        if (!selectedHistory) return;
        setSyncing(true);
        const updated = [...selectedHistory.contacts];
        let changed = false;
        try {
            const searchVariants = [];
            updated.forEach(c => {
                let p = c.whatsapp_socio.toString().replace(/\D/g, '');
                if (p.startsWith('55')) p = p.substring(2);

                // Variantes para o mesmo número (com e sem o 9 extra se for Brasil)
                if (p.length === 11 && p[2] === '9') {
                    // Tem o 9 extra: Adiciona versão com 9 e versão sem 9
                    const with9 = '55' + p;
                    const without9 = '55' + p.substring(0, 2) + p.substring(3);
                    searchVariants.push(with9, without9);
                } else if (p.length === 10) {
                    // Não tem o 9 extra: Adiciona versão sem 9 e versão com 9
                    const without9 = '55' + p;
                    const with9 = '55' + p.substring(0, 2) + '9' + p.substring(2);
                    searchVariants.push(without9, with9);
                } else {
                    searchVariants.push('55' + p);
                }
            });

            // Diagnóstico: Ver o que tem na tabela pra entender o formato (received_at em vez de created_at)
            // const { data: sample } = await supabase.from('wa_disparo_respostas')
            //     .select('phone, text_content, received_at')
            //     .limit(5)
            //     .order('received_at', { ascending: false });

            const { data } = await supabase.from('wa_disparo_respostas')
                .select('phone, text_content')
                .in('phone', searchVariants)
                .order('received_at', { ascending: false });

            if (data) {
                for (let i = 0; i < updated.length; i++) {
                    const cleanExcelPhone = updated[i].whatsapp_socio.toString().replace(/\D/g, '');
                    const excelSuffix = cleanExcelPhone.slice(-8); // Pega os últimos 8 dígitos (Mais seguro para BR)

                    // Filtra todas as respostas deste número
                    const contactData = data.filter(r => {
                        const cleanDbPhone = r.phone.replace(/\D/g, '');
                        return cleanDbPhone.endsWith(excelSuffix);
                    });

                    if (contactData.length > 0) {
                        // Procura se alguma de todas as respostas contém "sim"
                        const hasSim = contactData.some(r => r.text_content.toLowerCase().includes('sim'));
                        const hasNao = contactData.some(r => r.text_content.toLowerCase().includes('não') || r.text_content.toLowerCase().includes('nao'));

                        // Pega a última resposta textual para mostrar (já ordenado por received_at desc)
                        const lastResp = contactData[0];

                        if (hasSim) {
                            updated[i].status = 'confirmed';
                            changed = true;
                        } else if (hasNao) {
                            updated[i].status = 'denied';
                            changed = true;
                        }

                        updated[i].response = lastResp.text_content;
                    }
                }
            }
        } catch (e) { /* Erro silencioso em produção */ }
        if (changed) {
            // 1. ATUALIZAÇÃO LOCAL IMEDIATA
            const updatedHistory = history.map(h => h.id === selectedHistory.id ? { ...h, contacts: updated } : h);
            setHistory(updatedHistory);
            localStorage.setItem('disparo_history', JSON.stringify(updatedHistory));
            setSelectedHistory({ ...selectedHistory, contacts: updated });

            try {
                // 2. TENTATIVA DE SYNC EM BACKGROUND
                await supabase
                    .from('wa_envios_per')
                    .update({ contacts: updated })
                    .eq('id', selectedHistory.id);
                console.log('☁️ Sincronizado com a nuvem (update)');
            } catch (e) {
                console.warn('⚠️ Erro ao sincronizar update na nuvem (404). Mantido local.');
            }
        }
        setSyncing(false);
    };

    const toggleSelect = (id) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelectedIds(next);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === contacts.length && contacts.length > 0) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(contacts.map(c => c.id)));
        }
    };

    const handleCancel = (e) => {
        e.stopPropagation();
        setContacts([]);
        setSelectedIds(new Set());
        setStatus({ type: '', message: '' });
    };

    const renderBroadcastView = () => (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full pt-10 pb-20 flex flex-col items-center">


            {/* Upload Box */}
            <div className="dashboard-width">
                <div
                    className="upload-container group border-white/[0.03] bg-white/[0.01]"
                    onClick={() => contacts.length === 0 && document.getElementById('file-upload').click()}
                >
                    <input id="file-upload" type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden-input" />

                    {contacts.length > 0 ? (
                        <div className="space-y-6">
                            <div className="w-14 h-14 bg-indigo-500/10 rounded-2xl flex items-center justify-center mx-auto border border-indigo-500/20">
                                <CheckCircle2 className="w-7 h-7 text-indigo-400" />
                            </div>
                            <div className="space-y-4">
                                <h3 className="text-2xl font-black text-white italic uppercase tracking-tight">{contacts.length} Leads Carregados</h3>
                                <div className="flex justify-center">
                                    <button
                                        onClick={handleCancel}
                                        className="btn-cancel"
                                    >
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
                                <p className="text-sm text-slate-500 font-medium">Arraste ou selecione sua planilha extraída na Ferramenta Melhor Lead.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Status Message */}
            {status.message && (
                <div className="dashboard-width px-4">
                    <div className={`badge ${status.type === 'success' ? 'badge-success' : 'badge-error'} w-full justify-center p-4 !rounded-xl`}>
                        {status.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                        <span className="font-bold uppercase tracking-widest text-[10px]">{status.message}</span>
                    </div>
                </div>
            )}

            {/* Footer Actions (Floating) */}
            {contacts.length > 0 && (
                <div className="dashboard-width px-4">
                    <div className="card-footer py-6 border-t border-white/[0.02]">
                        <button
                            onClick={toggleSelectAll}
                            className="btn-secondary"
                        >
                            {selectedIds.size === contacts.length && contacts.length > 0 ? (
                                <CheckCircle2 className="w-4 h-4 text-indigo-400" />
                            ) : (
                                <div className="w-4 h-4 rounded-md border-2 border-white/20" />
                            )}
                            <span className="uppercase tracking-widest text-[11px] font-black">Selecionar Todos</span>
                        </button>

                        <button
                            className="btn-primary"
                            onClick={sendMessages}
                            disabled={selectedIds.size === 0 || sending}
                        >
                            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            <span className="uppercase tracking-[0.2em] text-[11px] font-black">Iniciar Disparos</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Leads List after import */}
            {contacts.length > 0 && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-8 dashboard-width card-premium overflow-hidden border-white/[0.03]"
                >
                    <div className="max-h-[500px] overflow-y-auto">
                        <table className="premium-table">
                            <thead>
                                <tr>
                                    <th className="w-10"></th>
                                    <th>Lead / Empresa</th>
                                    <th>WhatsApp</th>
                                    <th className="text-right">Status</th>
                                </tr>
                            </thead>
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
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full dashboard-width mx-auto pt-10 px-4 pb-20">
            {selectedHistory ? (
                <div className="space-y-10">
                    <div className="flex justify-between items-center">
                        <button
                            onClick={() => setSelectedHistory(null)}
                            className="flex items-center gap-3 text-slate-500 hover:text-white transition-all text-[11px] font-black uppercase tracking-[0.2em] group"
                        >
                            <div className="w-8 h-8 rounded-lg border border-white/5 flex items-center justify-center group-hover:border-indigo-500/30 group-hover:bg-indigo-500/5 transition-all">
                                <ArrowLeft className="w-4 h-4" />
                            </div>
                            Voltar para lista
                        </button>
                        <button onClick={syncResponses} disabled={syncing} className="btn-primary py-3 px-6 text-[11px]">
                            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            Atualizar Respostas
                        </button>
                    </div>

                    <div className="card-premium overflow-hidden border-white/[0.03]">
                        <div className="p-10 border-b border-white/5 bg-white/[0.01]">
                            <div className="flex items-center gap-6 mb-10">
                                <div className="w-14 h-14 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20 shadow-lg shadow-indigo-500/10">
                                    <Calendar className="w-6 h-6 text-indigo-400" />
                                </div>
                                <div>
                                    <h3 className="text-3xl font-black text-white italic uppercase tracking-tighter">Histórico de Envios</h3>
                                    <p className="text-sm text-slate-500 font-bold">{formatDate(selectedHistory.timestamp)}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="p-6 bg-white/[0.02] rounded-2xl border border-white/5 shadow-inner">
                                    <p className="text-slate-500 text-[9px] uppercase font-black tracking-[0.2em]">Total Processado</p>
                                    <p className="text-4xl font-black text-white mt-2 leading-none">{selectedHistory.total}</p>
                                </div>
                                <div className="p-6 bg-emerald-500/[0.03] rounded-2xl border border-emerald-500/10 shadow-inner">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="w-6 h-6 bg-emerald-500/10 rounded-lg flex items-center justify-center border border-emerald-500/20">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                        </div>
                                        <p className="text-emerald-500/60 text-[9px] uppercase font-black tracking-[0.2em]">Sucesso</p>
                                    </div>
                                    <p className="text-4xl font-black text-emerald-400 leading-none">{selectedHistory.success}</p>
                                </div>
                                <div className="p-6 bg-rose-500/[0.03] rounded-2xl border border-rose-500/10 shadow-inner">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="w-6 h-6 bg-rose-500/10 rounded-lg flex items-center justify-center border border-rose-500/20">
                                            <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                                        </div>
                                        <p className="text-rose-500/60 text-[9px] uppercase font-black tracking-[0.2em]">Falha</p>
                                    </div>
                                    <p className="text-4xl font-black text-rose-400 leading-none">{selectedHistory.error}</p>
                                </div>
                            </div>
                        </div>

                        <div className="max-h-[600px] overflow-y-auto">
                            <table className="premium-table">
                                <thead>
                                    <tr>
                                        <th>Lead / Empresa</th>
                                        <th>Status de Envio</th>
                                        <th className="text-right">Última Resposta</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedHistory.contacts.map((c, i) => (
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
                                            <td className="text-right">
                                                <span className="text-xs text-slate-400 font-medium italic">{c.response || '-'}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col gap-12">
                    {history && history.length > 0 ? history.map((item, idx) => (
                        <div
                            key={item.id || idx}
                            onClick={() => {
                                setSelectedHistory(item);
                            }}
                            className="card-premium p-10 cursor-pointer hover:border-indigo-500/30 hover:bg-white/[0.02] transition-all group flex flex-row items-center justify-between gap-10 border-white/[0.03] w-full"
                        >
                            {/* Card Content (Rest of the previous code) */}
                            <div className="flex items-center gap-8">
                                <div className="w-16 h-16 bg-indigo-500/5 rounded-2xl flex items-center justify-center border border-indigo-500/10 group-hover:bg-indigo-500/10 group-hover:border-indigo-500/30 transition-all">
                                    <Calendar className="w-8 h-8 text-indigo-400" />
                                </div>
                                <div className="space-y-2">
                                    <h4 className="font-black text-2xl text-white italic uppercase tracking-tight">Envio {formatDate(item.timestamp)}</h4>
                                    <div className="flex items-center gap-3">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em]">{item.total || 0} LEADS PROCESSADOS</p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-10 bg-white/[0.02] p-5 px-8 rounded-3xl border border-white/[0.05] shadow-inner">
                                <div className="flex items-center gap-5">
                                    <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20 shadow-lg shadow-emerald-500/5">
                                        <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest leading-tight">Sucesso</p>
                                        <p className="text-2xl font-black text-emerald-400 leading-none mt-1">{item.success || 0}</p>
                                    </div>
                                </div>

                                <div className="w-px h-12 bg-white/10" />

                                <div className="flex items-center gap-5">
                                    <div className="w-12 h-12 bg-rose-500/10 rounded-2xl flex items-center justify-center border border-rose-500/20 shadow-lg shadow-rose-500/5">
                                        <AlertCircle className="w-6 h-6 text-rose-400" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest leading-tight">Falha</p>
                                        <p className="text-2xl font-black text-rose-400 leading-none mt-1">{item.error || 0}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-end px-4">
                                <div className="w-12 h-12 rounded-full bg-white/[0.02] flex items-center justify-center border border-white/5 group-hover:border-indigo-500/30 transition-all">
                                    <ChevronRight className="w-6 h-6 text-white/20 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
                                </div>
                            </div>
                        </div>
                    )) : (
                        <div className="col-span-full py-40 text-center opacity-20">
                            <History className="w-20 h-20 mx-auto mb-6 text-slate-500" />
                            <p className="font-black uppercase tracking-[0.4em] text-slate-400 text-sm">Nenhum Histórico Encontrado (Check v1.1)</p>
                        </div>
                    )}
                </div>
            )}
        </motion.div>
    );

    return (
        <div id="app-container" className="relative">
            <div className="glow-spot glow-top-right" />
            <div className="glow-spot glow-bottom-left" />

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
