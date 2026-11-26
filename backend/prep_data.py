"""Back end: reads the five Excel datasets and writes frontend/data/data.json.
Mirrors the column detection of load_experiment_se() in the original Shiny app (djapp.R)."""
import pandas as pd, numpy as np, re, json, warnings
warnings.filterwarnings("ignore")
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
U=str(ROOT/"data"/"raw")+"/"          # put the five .xlsx files here
OUT=ROOT/"frontend"/"data"/"data.json"
sq=lambda s:re.sub(r"\s+"," ",str(s)).strip()   # collapse stray spaces in headers
# The previous Poonawala data came from the S5 control table (57 comparisons that are NOT in S3).
# Set True to append them after the 98 renamed S3 antibiotic conditions.
INCLUDE_S5_CONTROLS=False
def sig(x,n=4):
    return None if pd.isna(x) else float(f"{x:.{n}g}")
def pair_padj(a,pc,num):
    """Match each log2FC column to its padj column by suffix; if exactly one of each is left over (e.g. padj_StPh vs Stationary_phase) pair them."""
    suf=lambda c:re.sub(r"^log2_Fold_change_?","",c)
    m={c:"padj_"+suf(c) for c in a if "padj_"+suf(c) in pc}
    ra=[c for c in a if c not in m]; rp=[x for x in pc if x not in m.values()]
    if len(ra)==1 and len(rp)==1: m[ra[0]]=rp[0]
    return {c:[sig(x,3) for x in num(p)] for c,p in m.items()}
def load(file,sheet,name,omics,scale,pmid="",pmcid="",doi="",pub="",df=None,plain=False,conds=None,gid=None,disp=None,short=None):
    """plain=True keeps spaces in the column names (the renamed sheets); disp renames conditions for display."""
    if df is None: df=pd.read_excel(U+file,sheet_name=sheet)
    df.columns=[sq(c) if plain else re.sub(r"\s+","_",str(c).strip()) for c in df.columns]
    cols=list(df.columns)
    f=lambda p:[c for c in cols if re.search(p,c,re.I)]
    gid=gid or (f(r"Gene$|Rv|Primary_Target") or [cols[0]])[0]
    gnm=(f(r"Gene_Name|Common_Name|Gene_Symbol") or [gid])[0]
    if conds: a=list(conds)
    elif name=="Shee Transcriptome": a=[c for c in cols if c.startswith("Moxifloxacin_")]   # Moxifloxacin 2x / 4x / 8x
    elif name=="Schubert Proteome": a=[c for c in cols if c.startswith("expr_")]
    elif name=="Bei Absolute Transcriptome": a=["Mean_logRPKM"]
    else: a=f("log2")
    pc=f(r"padj|FDR|adj"); sc=[c for c in cols if re.match("sd_",c,re.I)]
    ids=df[gid].astype(object).where(df[gid].notna(),"").astype(str).tolist()
    k=0
    for i,v in enumerate(ids):
        if v=="": k+=1; ids[i]=f"unknown_{k}"
    seen=set();d=0
    for i,v in enumerate(ids):
        if v in seen: d+=1; ids[i]=f"{v}_dup{d}"
        seen.add(ids[i])
    names=df[gnm].astype(object).where(df[gnm].notna(),"").astype(str).tolist()
    sc_=(f(r"^(Gene_Symbol|Gene_Name|symbol)$") or [None])[0]
    dc_=(f(r"^(Common_Name\w*|name|Functional_annotation)$") or [None])[0]
    cl=lambda c:[("" if pd.isna(v) else str(v).strip()) for v in df[c]] if c else [""]*len(ids)
    num=lambda c:pd.to_numeric(df[c],errors="coerce")
    link=(f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/" if pmid else f"https://pmc.ncbi.nlm.nih.gov/articles/{pmcid}/" if pmcid else f"https://doi.org/{doi}" if doi else None)
    R=lambda c:disp(c) if disp else c
    out=dict(name=name,omics=omics,scale=scale,species="M. tuberculosis H37Rv",n_genes=len(ids),n_samples=len(a),
      pubmed_pmcid=(f"PMID: {pmid}" if pmid else f"PMCID: {pmcid}" if pmcid else None),doi=doi or None,publication=pub or None,link=link,
      short=short or name.split()[0],conds=a,ids=ids,sym=cl(sc_),desc=cl(dc_),
      fc={c:[sig(x) for x in num(c)] for c in a},
      padj=pair_padj(a,pc,num),
      sd={c:[sig(x) for x in num(s)] for c in a for s in sc if s=="sd_"+re.sub(r"^expr_","",c)})
    if disp:
        out["conds"]=[R(c) for c in out["conds"]]
        for k in ("fc","padj","sd"): out[k]={R(c):v for c,v in out[k].items()}
    return out
def load_bei2(file,name):
    """Bei Transcriptome (relative; Bei2datacollect2.xlsx), sheet 'log2FC_clean': one column per comparison, headed "<case> [AVG] log2FC (vs <reference>)",
    where log2FC = log2((case+1)/(reference+1)) computed from the replicate averages (see log2fc_padj.R).
    Study identifiers (PRJNA..., PMID 31723039) are removed from the condition names; padj is intentionally not included."""
    b=pd.read_excel(U+file,sheet_name="log2FC_clean")
    suf=re.compile(r" (?:AVG )?log2FC \(vs (.*)\)$")
    def cn(s):
        s=re.sub(r"\s*\bAVG\s*$","",sq(s)); s=re.sub(r"\bPRJNA\d+\b","",s); s=re.sub(r"^\s*31723039\b","",s)
        return sq(s)
    ids=b["gene"].astype(str).str.strip().tolist(); conds=[];fc={};refs={}
    for h in b.columns[1:]:
        m=suf.search(str(h)); c=cn(suf.sub("",str(h)))
        assert c not in fc,("duplicate condition after removing study ids",c)
        fc[c]=[sig(x,3) for x in pd.to_numeric(b[h],errors="coerce")]; conds.append(c); refs[c]=cn(m.group(1))
    return dict(name=name,short="Bei",omics="Transcriptomics",scale="Relative",species="M. tuberculosis H37Rv",n_genes=len(ids),n_samples=len(conds),
      pubmed_pmcid=None,doi=None,publication="Compendium of public Mtb RNA-seq studies (SRA); log2FC vs. each study's reference condition",link=None,
      conds=conds,ids=ids,sym=[""]*len(ids),desc=[""]*len(ids),fc=fc,padj={},sd={},refs=refs)
def poonawala():
    """Poonawala et al. 2024, sheet 'Table S3 Antibiotic rename' (log2FC, readable condition names).
    Gene symbols / descriptions are joined from 'Table S3 Antibiotic TPs'."""
    f="Poonawala_et_al2024_Antibiotics_transctiptome.xlsx"
    SPELL=[(r"\bBedaquilin\b","Bedaquiline"),(r"\bSreptomycin\b","Streptomycin")]   # typos in the source sheet headers
    def fix(c):
        for a,b in SPELL: c=re.sub(a,b,c)
        return c
    r=pd.read_excel(U+f,sheet_name="Table S3 Antibiotic rename"); r.columns=[fix(sq(c)) for c in r.columns]
    conds=[c for c in r.columns if c not in ("Gene","Gene name")]
    t=pd.read_excel(U+f,sheet_name="Table S3 Antibiotic TPs",usecols=["Gene","symbol","name"]).dropna(subset=["Gene"]).drop_duplicates("Gene")
    df=r.drop(columns="Gene name").merge(t,on="Gene",how="left")
    if INCLUDE_S5_CONTROLS:
        s5=pd.read_excel(U+f,sheet_name="Table S5 Control TPs"); s5.columns=[sq(c) for c in s5.columns]
        c5=[c for c in s5.columns if c not in ("Gene","symbol","name")]
        df=df.merge(s5[["Gene"]+c5].dropna(subset=["Gene"]).drop_duplicates("Gene"),on="Gene",how="left"); conds+=c5
    assert len(conds)==len(set(conds))
    return df,conds
_pdf,_pconds=poonawala()
# ---- Facts shown on the cover page (from Dataset_Background.xlsx; edit here, then re-run).
# country id = ISO 3166-1 numeric code used by the world map; lonlat = where the pin / globe centre goes.
# Sheet1 = the six dataset teams (+VIDO, Canada); Sheet2 = per-paper metadata (surname = first author).
POON_META=[{"surname": "Boshoff", "first": "Helena I M Boshoff", "scientists": 6, "countries": ["USA"], "title": "The transcriptional responses of Mycobacterium tuberculosis to inhibitors of metabolism: novel insights into drug mechanisms of action"}, {"surname": "Koul", "first": "Anil Koul", "scientists": 12, "countries": ["Belgium", "Switzerland", "Denmark", "Netherlands"], "title": "Delayed bactericidal response of Mycobacterium tuberculosis to bedaquiline involves remodelling of bacterial metabolism"}, {"surname": "Peterson", "first": "Eliza J R Peterson", "scientists": 4, "countries": ["USA"], "title": "Network analysis identifies Rv0324 and Rv0880 as regulators of bedaquiline tolerance in Mycobacterium tuberculosis"}, {"surname": "Ma", "first": "Shuyi Ma", "scientists": 7, "countries": ["USA"], "title": "Integrated Modeling of Gene Regulatory and Metabolic Networks in Mycobacterium tuberculosis"}, {"surname": "Liu", "first": "Yancheng Liu", "scientists": 10, "countries": ["USA"], "title": "Immune activation of the host cell induces drug tolerance in Mycobacterium tuberculosis both in vitro and in vivo"}, {"surname": "Venkataraman", "first": "Balaji Venkataraman", "scientists": 3, "countries": ["India"], "title": "A new microarray platform for whole-genome expression profiling of Mycobacterium tuberculosis"}, {"surname": "Karakousis", "first": "Petros C Karakousis", "scientists": 3, "countries": ["USA"], "title": "Altered expression of isoniazid-regulated genes in drug-treated dormant Mycobacterium tuberculosis"}, {"surname": "Srinivas", "first": "Vivek Srinivas", "scientists": 6, "countries": ["USA"], "title": "Transcriptome signature of cell viability predicts drug response and drug interaction in Mycobacterium tuberculosis"}, {"surname": "Ma", "first": "Shuyi Ma", "scientists": 7, "countries": ["USA"], "title": "Transcriptomic Signatures Predict Regulators of Drug Synergy and Clinical Regimen Efficacy against Tuberculosis"}, {"surname": "Van den Bossche", "first": "An Van den Bossche", "scientists": 8, "countries": ["Belgium", "France"], "title": "Transcriptional profiling of a laboratory and clinical Mycobacterium tuberculosis strain suggests respiratory poisoning upon exposure to delamanid"}, {"surname": "Boot", "first": "Maikel Boot", "scientists": 13, "countries": ["Netherlands", "Saudi Arabia", "USA", "Spain"], "title": "Accelerating Early Antituberculosis Drug Discovery by Creating Mycobacterial Indicator Strains That Predict Mode of Action"}, {"surname": "Kumar", "first": "Pradeep Kumar", "scientists": 33, "countries": ["USA"], "title": "Synergistic Lethality of a Binary Inhibitor of Mycobacterium tuberculosis KasA"}]
BEI_META=[{"surname": "Mishra", "first": "Richa Mishra", "scientists": 12, "countries": ["India"], "title": "Targeting redox heterogeneity to counteract drug tolerance in replicating Mycobacterium tuberculosis"}, {"surname": "Bandekar", "first": "Aditya C. Bandekar", "scientists": 4, "countries": ["USA"], "title": "Cell-Cycle-Associated Expression Patterns Predict Gene Function in Mycobacteria"}, {"surname": "Anand", "first": "Kushi Anand", "scientists": 14, "countries": ["India"], "title": "Mycobacterium tuberculosis SufR responds to nitric oxide via its 4Fe-4S cluster and regulates Fe-S cluster biogenesis for persistence in mice"}, {"surname": "Lee", "first": "Bei Shi Lee", "scientists": 21, "countries": ["Singapore", "New Zealand", "India", "South Africa", "USA"], "title": "Dual inhibition of the terminal oxidases eradicates antibiotic-tolerant Mycobacterium tuberculosis"}, {"surname": "Khan", "first": "Mehak Zahoor Khan", "scientists": 7, "countries": ["India"], "title": "Redox homeostasis in Mycobacterium tuberculosis is modulated by a novel actinomycete-specific transcription factor"}]
COUNTRY_GEO={"Switzerland":("756",8.2,46.8),"USA":("840",-98,39),"Canada":("124",-100,57),"UK":("826",-2,54),"China":("156",104,35),"India":("356",78.5,22),"Italy":("380",12.5,42.5),
 "Belgium":("056",4.6,50.6),"Denmark":("208",9.5,56),"Netherlands":("528",5.3,52.2),"France":("250",2.5,46.6),"Saudi Arabia":("682",45,24),"Spain":("724",-3.7,40),
 "Singapore":("702",103.8,1.35),"New Zealand":("554",172,-41.5),"South Africa":("710",24,-29)}
TEAM_COUNTRIES={"Schubert":["Switzerland"],"Bei":["USA","China"],"Vilcheze":["USA","UK"],"Poonawala":["USA","Italy"],"Shee":["India"],"VIDO":["Canada"]}
TEAM_SCIENTISTS={"Shee":13,"Vilcheze":6,"Bei":8,"Poonawala":9,"Schubert":12}   # per-dataset counts from Sheet1 (they overlap: 198 distinct names in total)
def _countries(kind):
    d={}
    for team,cs in TEAM_COUNTRIES.items():
        for c in cs: d.setdefault(c,{}).setdefault("datasets",[]).append(team)
    for k,M in (("poon",POON_META),("bei",BEI_META)):
        for m in M:
            for c in m["countries"]: d.setdefault(c,{}).setdefault(k,[]).append(m["surname"])
    return [dict(name=c,id=COUNTRY_GEO[c][0],lonlat=list(COUNTRY_GEO[c][1:]),datasets=v.get("datasets",[]),poon=v.get("poon",[]),bei=v.get("bei",[])) for c,v in d.items()]
ABOUT=dict(
  scientists=198,                                   # distinct names across Sheet1 + both metadata tables (VIDO scientists not yet listed)
  team_scientists=43,                              # distinct names on the dataset teams (Sheet1)
  types=["Antibiotic","Respiration","Nutrient","Infection","Genetic Manipulation"],   # the five condition types
  metadata=[dict(study="Poonawala",items=12,papers=POON_META),dict(study="Bei",items=60,papers=BEI_META)],
  team_sci=TEAM_SCIENTISTS,team_ctry=TEAM_COUNTRIES,
  countries=_countries(None))
E=[
load(None,None,"Poonawala Transcriptome","Transcriptomics","Relative",pmcid="PMC11064486",doi="10.1128/aac.01185-23",pub="Transcriptional profiling of Mycobacterium tuberculosis",df=_pdf,plain=True,conds=_pconds,gid="Gene"),
load("Transcriptome_Vilcheze.xlsx","Table S2c log2 fold change","Vilcheze Transcriptome","Transcriptomics","Relative",pmcid="PMC9283954",doi="10.3389/fimmu.2022.909904",pub="Transcriptional profiling of Mycobacterium tuberculosis"),
load("Transcriptome_Shee.xlsx","Sheet1","Shee Transcriptome","Transcriptomics","Relative",pmid="35975988",doi="10.1128/AAC.00592-22",pub="Moxifloxacin-Mediated Killing of Mycobacterium tuberculosis Involves Respiratory Downshift, Reductive Stress, and Accumulation of Reactive Oxygen Species",disp=lambda c:c.replace("_"," ")),
load_bei2("Bei2datacollect2.xlsx","Bei Transcriptome"),
load("Proteome_Schubert_2015.xlsx","Mtb absolute per condition","Schubert Proteome","Proteomics","Absolute",pmid="26094805",doi="10.1016/j.chom.2015.06.001",pub="Schubert Proteome 2015"),
load("Transcriptome_Bei_2024.xlsx","log2FC of 5th and 95th","Bei Absolute Transcriptome","Transcriptomics","Absolute",short="Bei Absolute",pmid="38600064",pmcid="PMC11006872",doi="10.1038/s41467-024-47410-5",pub="Genetically encoded transcriptional plasticity underlies stress adaptation in Mycobacterium tuberculosis"),
]
_all=[c for e in E for c in e["conds"]]
assert len(_all)==len(set(_all)),"condition names must be unique across datasets"
for e in E: print(e["name"],e["n_genes"],len(e["conds"]),list(e["padj"])[:2],len(e["sd"]))
ok=lambda s,i:bool(re.fullmatch(r"[A-Za-z][A-Za-z0-9\-]*",s)) and s!=i and not re.match(r"Rv\d",s)
gn={};gd={}
for e in E:
    for i,s,d in zip(e["ids"],e["sym"],e["desc"]):
        if ok(s,i) and i not in gn: gn[i]=s
        if d and d!=i and i not in gd: gd[i]=d
def key(g):
    m=re.match(r"Rv(\d+)([A-Za-z]*)",g); return (0,int(m.group(1)),m.group(2),g) if m else (1,0,"",g)
genes=sorted({i for e in E for i in e["ids"]},key=key)
for e in E: del e["sym"],e["desc"]
json.dump(dict(about=ABOUT,exps=E,genes=genes,gname={g:gn.get(g,"") for g in genes},gdesc={g:gd.get(g,"") for g in genes}),open(OUT,"w"),separators=(",",":"))
import os;print(len(genes),os.path.getsize(OUT)/1e6,"MB")
