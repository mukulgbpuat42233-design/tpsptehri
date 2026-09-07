const SB_URL='https://kpknazwugehnohojixtl.supabase.co';
const SB_KEY='sb_publishable_iFnVavidtYI2vODRItISkA_YqGxH1zR';

function send(res,status,data){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify(data));
}
function userIdFromJwt(token){
  try{
    const p=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
    const json=Buffer.from(p,'base64').toString('utf8');
    return JSON.parse(json).sub||null;
  }catch(e){return null}
}
async function supa(path,options={}){
  const headers=Object.assign({
    apikey:SB_KEY,
    'Content-Type':'application/json'
  },options.headers||{});
  const r=await fetch(SB_URL+path,Object.assign({},options,{headers}));
  const text=await r.text();
  let data; try{data=text?JSON.parse(text):null}catch(e){data={message:text}};
  return {status:r.status,data};
}
module.exports=async function(req,res){
  if(req.method!=='POST') return send(res,405,{error:'POST required'});
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const action=body.action;
    if(action==='login'){
      const r=await supa('/auth/v1/token?grant_type=password',{
        method:'POST',body:JSON.stringify({email:body.email,password:body.password})
      });
      return send(res,r.status,r.data);
    }
    if(action==='signup'){
      const r=await supa('/auth/v1/signup',{method:'POST',body:JSON.stringify({email:body.email,password:body.password})});
      return send(res,r.status,r.data);
    }
    if(action==='refresh'){
      const r=await supa('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:body.refresh_token})});
      return send(res,r.status,r.data);
    }
    const token=body.access_token;
    if(!token) return send(res,401,{message:'Missing access token'});
    const uid=userIdFromJwt(token);
    const h={Authorization:'Bearer '+token};
    if(action==='list'){
      const r=await supa('/rest/v1/psp_monthly_data?select=*&order=updated_at.desc',{headers:h});
      return send(res,r.status,r.data);
    }
    if(action==='get'){
      const key=encodeURIComponent(body.record_key);
      const r=await supa('/rest/v1/psp_monthly_data?select=*&record_key=eq.'+key,{headers:h});
      return send(res,r.status,r.data);
    }
    if(action==='save'){
      if(!uid) return send(res,401,{message:'Invalid user token'});
      const r=await supa('/rest/v1/psp_monthly_data?on_conflict=user_id,record_key',{
        method:'POST',
        headers:Object.assign({},h,{'Prefer':'resolution=merge-duplicates,return=representation'}),
        body:JSON.stringify({user_id:uid,record_key:body.record_key,record:body.record})
      });
      return send(res,r.status,r.data);
    }
    if(action==='delete'){
      const key=encodeURIComponent(body.record_key);
      const r=await supa('/rest/v1/psp_monthly_data?record_key=eq.'+key,{method:'DELETE',headers:h});
      return send(res,r.status,r.data);
    }
    if(action==='deleteAll'){
      const r=await supa('/rest/v1/psp_monthly_data',{method:'DELETE',headers:h});
      return send(res,r.status,r.data);
    }
    return send(res,400,{message:'Unknown action'});
  }catch(e){return send(res,500,{message:e.message||String(e)})}
};
