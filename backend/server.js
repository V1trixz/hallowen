import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.LOFYPAY_API_KEY || '';
const LOFY_BASE = process.env.LOFYPAY_BASE_URL || 'https://app.lofypay.com/api/v1';
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));
const FILE = path.join(__dirname, 'data', 'tickets.json');
const read = () => { try { return JSON.parse(fs.readFileSync(FILE,'utf-8')); } catch { return []; } };
const write = (d) => fs.writeFileSync(FILE, JSON.stringify(d,null,2));
const genCode = () => { const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let r=''; for(let i=0;i<6;i++) r+=c[Math.floor(Math.random()*c.length)]; return `HLW-${r}`; };
const calc = (qty) => { const base=0.20, disc=0.015, min=0.155; const eff=Math.max(min, base-(qty-1)*disc); const sub=35*qty; const fee=sub*eff; return {subtotal:sub, fee, total:sub+fee}; };
async function criarPix({amount, external_reference, client}){
  if(!API_KEY || API_KEY.startsWith('sk_test_')){ const id='test_'+Date.now(); const code=`00020126580014br.gov.bcb.pix0136${id}520400005303986540${amount.toFixed(2)}5802BR5913HALLOWEEN`; return {idTransaction:id, paymentCode:code, mock:true}; }
  const res=await fetch(`${LOFY_BASE}/gateway`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${API_KEY}`},body:JSON.stringify({amount, method:'pix', external_reference, notification_url:`${process.env.FRONTEND_URL}/api/webhook/lofypay`, expiration:1800, client})});
  return await res.json();
}
async function statusPix(id){ if(id.startsWith('test_')) return {status:'WAITING_FOR_APPROVAL'}; const r=await fetch(`${LOFY_BASE}/status`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${API_KEY}`},body:JSON.stringify({idtransaction:id})}); return await r.json(); }
app.post('/api/criar-pix', async (req,res)=>{ const {nome,cpf,email,whatsapp,quantidade}=req.body; if(!nome||!cpf||!email) return res.status(400).json({error:'Dados incompletos'}); const qty=Math.min(6,Math.max(1,parseInt(quantidade)||1)); const c=calc(qty); const codigo=genCode(); const lofy=await criarPix({amount:c.total, external_reference:codigo, client:{name:nome, document:cpf.replace(/\D/g,''), email}}); const tickets=read(); tickets.push({codigo,nome,cpf,email,whatsapp,quantidade:qty,...c,idTransaction:lofy.idTransaction,paymentCode:lofy.paymentCode,status:'pending',criadoEm:new Date().toISOString()}); write(tickets); res.json({codigo,...c,idTransaction:lofy.idTransaction,paymentCode:lofy.paymentCode}); });
app.post('/api/verificar-status', async (req,res)=>{ const {idTransaction}=req.body; const s=await statusPix(idTransaction); const tickets=read(); const t=tickets.find(x=>x.idTransaction===idTransaction); if(t && s.status==='PAID_OUT'){ t.status='paid'; t.pagoEm=new Date().toISOString(); write(tickets); } res.json({status:s.status, ticket:t}); });
app.post('/api/sandbox/pagar',(req,res)=>{ const tickets=read(); const t=tickets.find(x=>x.idTransaction===req.body.idTransaction); if(!t) return res.status(404).json({error:'Nao encontrado'}); t.status='paid'; t.pagoEm=new Date().toISOString(); write(tickets); res.json({ok:true, ticket:t}); });
app.post('/api/webhook/lofypay', async (req,res)=>{ const {idTransaction, external_reference}=req.body; if(idTransaction){ const s=await statusPix(idTransaction); if(s.status==='PAID_OUT'){ const tickets=read(); const t=tickets.find(x=>x.idTransaction===idTransaction||x.codigo===external_reference); if(t){ t.status='paid'; write(tickets); } } } res.send('ok'); });
app.get('/api/ticket/:codigo',(req,res)=>{ const t=read().find(x=>x.codigo===req.params.codigo); if(!t) return res.status(404).json({error:'Nao encontrado'}); res.json(t); });
app.get('/api/meus-ingressos',(req,res)=>{ const codigos=(req.query.codigos||'').split(',').filter(Boolean); res.json(read().filter(t=>codigos.includes(t.codigo))); });
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'../frontend/index.html')));
app.listen(PORT,()=>console.log(`Rodando http://localhost:${PORT}`));
