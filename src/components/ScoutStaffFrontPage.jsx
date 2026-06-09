import React, { useState, useEffect } from 'react';

export default function ScoutStaffFrontPage({ setView }) {
  const [staff, setStaff] = useState(() => {
    const saved = localStorage.getItem('scout_staff_empty_members');
    return saved ? JSON.parse(saved) : [
      { role: "Scout Assignment 1", bio: "Enter background evaluation profiles, localized recruiting pipeline regions, or assignment notes here.", img: "" },
      { role: "Scout Assignment 2", bio: "Enter background evaluation profiles, localized recruiting pipeline regions, or assignment notes here.", img: "" }
    ];
  });

  useEffect(() => {
    localStorage.setItem('scout_staff_empty_members', JSON.stringify(staff));
  }, [staff]);

  const updateBio = (idx, value) => {
    const updated = [...staff];
    updated[idx].bio = value;
    setStaff(updated);
  };

  const handleImg = (idx, e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const updated = [...staff];
        updated[idx].img = reader.result;
        setStaff(updated);
      };
      reader.readAsDataURL(file);
    }
  };

  const aiPromptStr = "A crisp, professional athletic profile headshot of a college football coach/recruiter, mid-30s, athletic build, wearing a sharp modern team-branded polo shirt. The artwork must perfectly mimic the highly-polished, clean, slightly stylized illustration and 3D animation style seen in EA Sports College Football menus. Solid, soft-gradient studio background, cinematic dramatic lighting, clean edges, high-resolution video game UI asset concept art.";

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Dynamic Scout Profile Grid Cards */}
      <div className="grid md:grid-cols-2 gap-6">
        {staff.map((scout, idx) => (
          <div key={idx} className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-center space-x-5 shadow-lg">
            <div className="relative w-28 h-28 bg-slate-950 border border-slate-800 rounded-lg overflow-hidden group flex flex-col items-center justify-center shrink-0">
              {scout.img ? (
                <img src={scout.img} alt="Scout Avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="text-[10px] uppercase tracking-widest text-slate-600 font-bold text-center px-2">Unassigned Image</div>
              )}
              <label className="absolute inset-0 bg-slate-950/80 flex items-center justify-center text-center p-2 opacity-0 group-hover:opacity-100 transition cursor-pointer text-[10px] font-bold text-emerald-400 uppercase">
                Upload Image
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImg(idx, e)} />
              </label>
            </div>
            <div className="flex-1 space-y-2">
              <input 
                type="text" 
                value={scout.role} 
                onChange={(e) => {
                  const updated = [...staff];
                  updated[idx].role = e.target.value;
                  setStaff(updated);
                }} 
                className="bg-transparent text-xs font-black tracking-widest text-emerald-400 uppercase focus:outline-none focus:border-b border-slate-700 w-full"
              />
              <textarea
                value={scout.bio}
                onChange={(e) => updateBio(idx, e.target.value)}
                rows={3}
                className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-300 p-2 rounded focus:outline-none focus:border-emerald-500 resize-none transition"
                placeholder="Enter background parameters..."
              />
            </div>
          </div>
        ))}
      </div>

      {/* AI Tool Generator Block */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3 shadow-lg">
        <div className="flex justify-between items-center">
          <span className="text-xs font-black tracking-widest text-slate-400 uppercase">Staff Avatar Generation Prompt</span>
          <button 
            type="button"
            onClick={() => navigator.clipboard.writeText(aiPromptStr)} 
            className="text-[10px] font-black uppercase tracking-wider bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-3 py-1.5 rounded transition"
          >
            Copy Prompt
          </button>
        </div>
        <p className="text-xs text-slate-400 italic bg-slate-950 border border-slate-850 p-3 rounded leading-relaxed">{aiPromptStr}</p>
      </div>

      {/* Navigation Directory Grid Menu */}
      <div className="space-y-3">
        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-600">Application Sub-Systems</h4>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <button onClick={() => setView('input')} className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-left hover:border-emerald-500/40 hover:bg-slate-850/30 transition group shadow-md">
            <span className="text-sm font-bold block text-slate-300 group-hover:text-emerald-400 transition uppercase tracking-wide">AI Ingest Box</span>
            <span className="text-[10px] text-slate-500 block mt-1">Paste raw text string</span>
          </button>
          <button onClick={() => setView('database')} className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-left hover:border-emerald-500/40 hover:bg-slate-850/30 transition group shadow-md">
            <span className="text-sm font-bold block text-slate-300 group-hover:text-emerald-400 transition uppercase tracking-wide">Player Ledger</span>
            <span className="text-[10px] text-slate-500 block mt-1">View active database</span>
          </button>
          <button onClick={() => setView('analysis')} className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-left hover:border-emerald-500/40 hover:bg-slate-850/30 transition group shadow-md">
            <span className="text-sm font-bold block text-slate-300 group-hover:text-emerald-400 transition uppercase tracking-wide">Strategy Matrix</span>
            <span className="text-[10px] text-slate-500 block mt-1">Archetype parameters</span>
          </button>
          <button onClick={() => setView('thresholds')} className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-left hover:border-emerald-500/40 hover:bg-slate-850/30 transition group shadow-md">
            <span className="text-sm font-bold block text-slate-300 group-hover:text-emerald-400 transition uppercase tracking-wide">Benchmarks</span>
            <span className="text-[10px] text-slate-500 block mt-1">Historical criteria</span>
          </button>
          <button onClick={() => setView('counts')} className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-left hover:border-emerald-500/40 hover:bg-slate-850/30 transition group shadow-md">
            <span className="text-sm font-bold block text-slate-300 group-hover:text-emerald-400 transition uppercase tracking-wide">Tier Counts</span>
            <span className="text-[10px] text-slate-500 block mt-1">Star level tally</span>
          </button>
        </div>
      </div>
    </div>
  );
}
