const mean = a => a.length ? a.reduce((s,x)=>s+x,0)/a.length : 0
const round = x => Number(x.toFixed(4))
function distances(a,b) {
  const totalVariation = (key,segments) => a[key].reduce((sum,x,i) => sum+Math.abs(x-b[key][i]),0)/(2*segments)
  const union = new Set([...a.words,...b.words])
  const common = [...a.words].filter(word => b.words.has(word)).length
  return {
    palette:totalVariation('palette',6),sound:totalVariation('sound',6),
    structure:mean(a.structure.map((x,i) => Math.abs(x-b.structure[i]))),
    title:union.size ? 1-common/union.size : 0,
  }
}

// Jacobi diagonalization. The first largest off-diagonal entry wins ties.
function mapCoordinates(matrix) {
  const size=matrix.length
  const squared=matrix.map(row=>row.map(x=>x*x))
  const rows=squared.map(mean), grand=mean(rows)
  const a=squared.map((row,i)=>row.map((x,j)=>-.5*(x-rows[i]-rows[j]+grand)))
  const v=a.map((row,i)=>row.map((_,j)=>Number(i===j)))
  for (let iteration=0;iteration<50*size*size;iteration++) {
    let p=0,q=0,max=1e-12
    for (let i=0;i<size;i++) for (let j=i+1;j<size;j++) {
      if (Math.abs(a[i][j])>max) {max=Math.abs(a[i][j]);p=i;q=j}
    }
    if (p===q) break
    const angle=.5*Math.atan2(2*a[p][q],a[q][q]-a[p][p])
    const c=Math.cos(angle),s=Math.sin(angle)
    const pp=a[p][p],qq=a[q][q],pq=a[p][q]
    for (let i=0;i<size;i++) {
      if (i!==p && i!==q) {
        const ip=a[i][p],iq=a[i][q]
        a[i][p]=a[p][i]=c*ip-s*iq
        a[i][q]=a[q][i]=s*ip+c*iq
      }
      const vp=v[i][p],vq=v[i][q]
      v[i][p]=c*vp-s*vq
      v[i][q]=s*vp+c*vq
    }
    a[p][p]=c*c*pp-2*s*c*pq+s*s*qq
    a[q][q]=s*s*pp+2*s*c*pq+c*c*qq
    a[p][q]=a[q][p]=0
  }
  const axes=a.map((row,i)=>i).sort((i,j)=>a[j][j]-a[i][i] || i-j).slice(0,2).map(k=>{
    const anchor=v.reduce((best,row,i)=>Math.abs(row[k])>Math.abs(v[best][k]) ? i : best,0)
    const scale=(v[anchor][k]<0 ? -1 : 1)*Math.sqrt(Math.max(0,a[k][k]))
    return v.map(row=>round(row[k]*scale))
  })
  return matrix.map((_,i)=>({x:axes[0]?.[i] ?? 0,y:axes[1]?.[i] ?? 0}))
}
export function fieldScores(records,features) {
  const components=features.map(a=>features.map(b=>distances(a,b)))
  const matrix=components.map(row=>row.map(d=>.25*d.palette+.35*d.sound+.25*d.structure+.15*d.title))
  const coords=mapCoordinates(matrix)
  records.forEach((record,i)=>{
    const others=components[i].filter((_,j)=>i!==j)
    record.uniqueness=round(100*mean(matrix[i].filter((_,j)=>i!==j)))
    record.uniquenessMeasures=Object.fromEntries(['palette','sound','structure','title'].map(key=>[key,round(mean(others.map(d=>d[key])))]))
    record.map=coords[i]
  })
}
