# Bake Xelith solidu (Particles_Xelith_Obsah1): rudé světlo z emisních dílů Obsah0 + AO.
# blender -b newworldorder8ai.blend --python bake_xelith.py -- <res> <lightSamples> <outBlend> <outGlb>
import bpy, os, sys, math
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
RES = int(argv[0]) if len(argv) > 0 else 2048
LSAMPLES = int(argv[1]) if len(argv) > 1 else 256
OUT_BLEND = argv[2] if len(argv) > 2 and argv[2] != '-' else ''
OUT_GLB = argv[3] if len(argv) > 3 and argv[3] != '-' else ''
# dozvuk kolem světel: druhý průchod s emisními díly odsazenými o HALO_OFFSET m od povrchu (světlo pak padá i na okolní
# kov, ne jen pod díl) a víc odrazy; výsledek = max(přímý bake, dozvuk × HALO_GAIN). 0 = jen přímý bake.
HALO_OFFSET = float(argv[4]) if len(argv) > 4 else 0.0
HALO_GAIN = float(argv[5]) if len(argv) > 5 else 1.0
# strop dozvuku (podíl plného jasu textury): světlá místa (panely, diamanty) zůstanou ostrá, dozvuk jen doplní okolí
HALO_CAP = float(argv[6]) if len(argv) > 6 else 1.0
AO_DIST = 0.12
BAKE_DIR = r'C:\WEBOS\ASSETS\bake'
os.makedirs(BAKE_DIR, exist_ok=True)

sc = bpy.context.scene
vl = bpy.context.view_layer
sc.render.engine = 'CYCLES'
sc.cycles.device = 'GPU'
prefs = bpy.context.preferences.addons['cycles'].preferences
try:
    prefs.compute_device_type = 'OPTIX'
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type != 'CPU'
except Exception as e:
    print('GPU setup', e)

o0 = bpy.data.objects['Particles_Xelith_Obsah0']
# opakovaný bake (soubor už obsahuje zapečený solid): zdroj vrátit do kolekce kostka, starý bake smazat
src = bpy.data.objects.get('Particles_Xelith_Obsah1 zdroj')
if src:
    old_baked = bpy.data.objects.get('Particles_Xelith_Obsah1')
    if old_baked:
        old_me = old_baked.data
        bpy.data.objects.remove(old_baked)
        if old_me.users == 0:
            bpy.data.meshes.remove(old_me)
    old_mat = bpy.data.materials.get('Xelith Solid Baked')
    if old_mat and old_mat.users == 0:
        bpy.data.materials.remove(old_mat)
    bpy.data.collections['kostka'].objects.link(src)
    src.use_fake_user = False
    src.name = 'Particles_Xelith_Obsah1'
o1 = bpy.data.objects['Particles_Xelith_Obsah1']
dg = bpy.context.evaluated_depsgraph_get()

# --- nový objekt s hotovým (decimovaným) tvarem; původní s modifikátory jde do vypnuté kolekce "Xelith bake zdroj"
me = bpy.data.meshes.new_from_object(o1.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
me.name = 'Xelith_Obsah1_baked'
slot_mats = [s.material for s in o1.material_slots]
mw = o1.matrix_world.copy()
# zdroj mimo scénu (glTF exportér bere i vypnuté kolekce), drží ho fake user: Blender File > Objects
o1.name = 'Particles_Xelith_Obsah1 zdroj'
for c in list(o1.users_collection):
    c.objects.unlink(o1)
o1.use_fake_user = True

nb = bpy.data.objects.new('Particles_Xelith_Obsah1', me)
nb.matrix_world = mw
bpy.data.collections['kostka'].objects.link(nb)
while len(me.materials) < len(slot_mats):
    me.materials.append(None)
for i, m in enumerate(slot_mats):
    nb.material_slots[i].link = 'DATA'
    me.materials[i] = m
print('baked mesh', len(me.vertices), 'verts', len(me.polygons), 'faces')
used = sorted({p.material_index for p in me.polygons})
print('used slots', [(i, slot_mats[i].name if slot_mats[i] else None) for i in used])
metal = bpy.data.materials['Scratched Metal']
magma = bpy.data.materials['magma']

# --- bake UV: smart project + concave balení (~60 % plochy)
me.uv_layers.new(name='BakeUV', do_init=False)
me.uv_layers.active = me.uv_layers['BakeUV']
for o in vl.objects:
    o.select_set(False)
vl.objects.active = nb
nb.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.002, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
bpy.ops.uv.select_all(action='SELECT')
bpy.ops.uv.pack_islands(rotate=True, margin_method='FRACTION', margin=0.002, shape_method='CONCAVE')
bpy.ops.object.mode_set(mode='OBJECT')
# po edit módu jsou staré reference na vrstvy neplatné
old = me.uv_layers.get('UVMap')
if old:
    me.uv_layers.remove(old)
bake_uv = me.uv_layers['BakeUV']
bake_uv.active = True
bake_uv.active_render = True

uvs = np.zeros(len(me.loops) * 2, dtype=np.float32)
bake_uv.data.foreach_get('uv', uvs)
uvs = uvs.reshape(-1, 2)
uv_area = 0.0; w_area = 0.0
for p in me.polygons:
    pts = uvs[list(p.loop_indices)]
    x, y = pts[:, 0], pts[:, 1]
    uv_area += 0.5 * abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1)))
    w_area += p.area
sx = mw.to_scale()[0]
print(f'UV coverage {uv_area:.3f}, world area {w_area * sx * sx:.3f} m2 -> {RES * math.sqrt(uv_area / (w_area * sx * sx)):.0f} px/m')

def make_image(name, is_float, colorspace):
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    img = bpy.data.images.new(name, RES, RES, alpha=False, float_buffer=is_float)
    img.colorspace_settings.name = colorspace
    return img

def with_target(mat, img):
    m = mat.copy()
    nt = m.node_tree
    n = nt.nodes.new('ShaderNodeTexImage')
    n.image = img
    for x in nt.nodes:
        x.select = False
    n.select = True
    nt.nodes.active = n
    return m

def assign(per_slot):
    for i in range(len(me.materials)):
        me.materials[i] = per_slot(i)

def white_diffuse(img):
    m = bpy.data.materials.new('_bake_white')
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (1, 1, 1, 1)
    b.inputs['Metallic'].default_value = 0.0
    b.inputs['Roughness'].default_value = 1.0
    r = with_target(m, img)
    bpy.data.materials.remove(m)
    return r

bk = sc.render.bake
bk.margin = 6
bk.margin_type = 'EXTEND'
bk.use_clear = True
bk.target = 'IMAGE_TEXTURES'
sc.cycles.use_denoising = False

def pix(img):
    a = np.empty(RES * RES * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(RES, RES, 4)

def save_byte(name, rgb, colorspace, fmt, quality=92):
    n = rgb.shape[0]
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    img = bpy.data.images.new(name, n, n, alpha=False, float_buffer=False)
    img.colorspace_settings.name = colorspace
    a = np.ones((n, n, 4), dtype=np.float32)
    a[:, :, :3] = np.clip(rgb, 0, 1)
    img.pixels.foreach_set(a.ravel())
    ext = 'jpg' if fmt == 'JPEG' else 'png'
    path = os.path.join(BAKE_DIR, f'{name}.{ext}')
    img.filepath_raw = path
    img.file_format = fmt
    if fmt == 'JPEG':
        img.save(filepath=path, quality=quality)
    else:
        img.save(filepath=path)
    img.filepath = path
    img.reload()
    return img

def srgb(x):
    x = np.clip(x, 0, None)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)

# jen kostka (Obsah0 + nový solid), ostatní objekty z renderu pryč
hidden = []
for o in sc.objects:
    if o not in (nb, o0) and not o.hide_render:
        o.hide_render = True
        hidden.append(o)
# Obsah0 bez GN = skutečné plochy s emisními materiály (na webu jsou z nich particly)
gn_state = [(m, m.show_render, m.show_viewport) for m in o0.modifiers if m.type == 'NODES']
for m, _, _ in gn_state:
    m.show_render = False
    m.show_viewport = False
world = sc.world
bg = world.node_tree.nodes.get('Background') if world and world.node_tree else None
bg_strength = bg.inputs['Strength'].default_value if bg else None
if bg:
    bg.inputs['Strength'].default_value = 0.0

# 1) světlo: bílá difuze, jen emise z Obsah0 (+ magma solidu)
f_lit = make_image('_f_light', True, 'Linear Rec.709')
m_lit = white_diffuse(f_lit)
m_mag = with_target(magma, f_lit)
assign(lambda i: m_mag if slot_mats[i] == magma else m_lit)
sc.cycles.samples = LSAMPLES
sc.cycles.max_bounces = 3
sc.cycles.diffuse_bounces = 1
bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'})
lit = pix(f_lit)[:, :, :3]
mx = lit.max(2)
nz = mx[mx > 1e-5]
print('light max-channel p50/p90/p99/p99.5/p99.9', np.percentile(nz, [50, 90, 99, 99.5, 99.9]))
scale = 1.0 / max(1e-6, float(np.percentile(nz, 99.5)))
print('light scale', scale, '-> emissive strength', 1 / scale)
np.save(os.path.join(BAKE_DIR, '_raw_light_direct.npy'), lit.astype(np.float16))

if HALO_OFFSET > 0:
    disp = o0.modifiers.new('_bake_halo', 'DISPLACE')
    disp.direction = 'NORMAL'
    disp.mid_level = 0.0
    disp.strength = HALO_OFFSET / max(1e-6, o0.matrix_world.to_scale()[0])
    sc.cycles.diffuse_bounces = 3
    sc.cycles.max_bounces = 5
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'})
    halo = pix(f_lit)[:, :, :3]
    o0.modifiers.remove(disp)
    np.save(os.path.join(BAKE_DIR, '_raw_light_halo.npy'), halo.astype(np.float16))
    # kde už světlo je (panely, diamanty + ~8 px okolí), dozvuk nepřidávat: jinak zaplní mezery mezi pixely panelu
    # a vzor se slije do fleků. Maska = rozšířená (max) a rozmazaná (průměr) oblast jasu přímého bake.
    bright = (lit.max(2) * scale > 0.35).astype(np.float32)
    def box(a, r, fn):
        out = a.copy()
        for ax in (0, 1):
            acc = out.copy()
            for k in range(1, r + 1):
                acc = fn(acc, np.roll(out, k, ax)); acc = fn(acc, np.roll(out, -k, ax))
            out = acc if fn is np.maximum else acc / (2 * r + 1)
        return out
    keep = box(box(bright, 8, np.maximum), 4, np.add)
    halo_add = np.minimum(halo * HALO_GAIN, HALO_CAP / scale) * (1.0 - np.clip(keep, 0, 1))[:, :, None]
    lit = np.maximum(lit, halo_add)
    print('halo p50/p90/p99', np.percentile(halo.max(2)[halo.max(2) > 1e-5], [50, 90, 99]))

# 2) AO (stínění ve spárách, na webu tlumí odrazy okolí)
f_ao = make_image('_f_ao', True, 'Linear Rec.709')
m_ao = with_target(bpy.data.materials['_bake_white'] if '_bake_white' in bpy.data.materials else m_lit, f_ao)
m_mag2 = with_target(magma, f_ao)
assign(lambda i: m_mag2 if slot_mats[i] == magma else m_ao)
world.light_settings.distance = AO_DIST
sc.cycles.samples = 384
# AO jen ze solidu: díly Obsah0 jsou na webu particly s mezerami, jejich stín by dělal černé fleky
o0_hr = o0.hide_render
o0.hide_render = True
bpy.ops.object.bake(type='AO')
o0.hide_render = o0_hr
ao = pix(f_ao)[:, :, 0]
ao = ao.reshape(RES // 2, 2, RES // 2, 2).mean((1, 3))  # 1024 px, míň šumu
print('ao mean', ao.mean(), 'p5', np.percentile(ao, 5))

# obnovit scénu
for m, r, v in gn_state:
    m.show_render = r
    m.show_viewport = v
if bg:
    bg.inputs['Strength'].default_value = bg_strength
for o in hidden:
    o.hide_render = False

i_lit = save_byte('xelith_solid_light', srgb(lit * scale), 'sRGB', 'JPEG', 94)
i_ao = save_byte('xelith_solid_ao', np.repeat(ao[:, :, None], 3, 2), 'Non-Color', 'JPEG', 88)
for n in ['_f_light', '_f_ao']:
    bpy.data.images.remove(bpy.data.images[n])
for m in [m_lit, m_mag, m_ao, m_mag2]:
    bpy.data.materials.remove(m)

# --- glTF Material Output (Occlusion) – exportér z něj bere occlusionTexture
def gltf_output_group():
    g = bpy.data.node_groups.get('glTF Material Output')
    if g:
        return g
    g = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
    g.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    g.interface.new_socket('Thickness', in_out='INPUT', socket_type='NodeSocketFloat')
    return g

# --- finální materiál: tmavý kov, světlo jako emise (web ho čte jako světlo na kovu, SolidLink.jsx), AO
fm = bpy.data.materials.new('Xelith Solid Baked')
fm.use_nodes = True
nt = fm.node_tree
b = nt.nodes.get('Principled BSDF')
uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = 'BakeUV'; uvn.location = (-900, 0)
tl = nt.nodes.new('ShaderNodeTexImage'); tl.image = i_lit; tl.location = (-600, -300); tl.label = 'rudé světlo (bake)'
ta = nt.nodes.new('ShaderNodeTexImage'); ta.image = i_ao; ta.location = (-600, 200); ta.label = 'AO (bake)'
i_ao.colorspace_settings.name = 'Non-Color'
for t in (tl, ta):
    nt.links.new(uvn.outputs['UV'], t.inputs['Vector'])
nt.links.new(tl.outputs['Color'], b.inputs['Emission Color'])
b.inputs['Emission Strength'].default_value = 1.0 / scale
b.inputs['Base Color'].default_value = (0.3, 0.3, 0.3, 1)
b.inputs['Metallic'].default_value = 1.0
b.inputs['Roughness'].default_value = 0.3
sep = nt.nodes.new('ShaderNodeSeparateColor'); sep.location = (-300, 300)
nt.links.new(ta.outputs['Color'], sep.inputs['Color'])
go = nt.nodes.new('ShaderNodeGroup'); go.node_tree = gltf_output_group(); go.location = (200, 300)
nt.links.new(sep.outputs[0], go.inputs['Occlusion'])
fm['xelithBakedLight'] = 1.0 / scale
for i in range(len(me.materials)):
    me.materials[i] = fm if slot_mats[i] == metal else slot_mats[i]

txt = bpy.data.texts.get('XELITH_BAKE') or bpy.data.texts.new('XELITH_BAKE')
txt.clear()
txt.write('''Particles_Xelith_Obsah1 = zapečený solid (decimate aplikovaný, UV "BakeUV").
Materiál "Xelith Solid Baked": emise = rudé světlo z emisních dílů Obsah0 (Cycles bake, DIFFUSE direct+indirect,
síla emise = expozice textury), glTF Material Output Occlusion = AO jen ze solidu.
Web (SolidLink.jsx) emisi nečte jako záři, ale jako světlo dopadající na kov.
Původní objekt s GN + Decimate: "Particles_Xelith_Obsah1 zdroj" (mimo scénu, fake user; Blender File > Objects).
Nový bake: WEBOS/tools/bake_xelith.py, spustit na tomto souboru (blender -b <soubor> --python bake_xelith.py -- 2048 512 <out.blend> <out.glb>), popis v WEBOS/LIGHTING.md.
''')

if OUT_BLEND:
    bpy.ops.file.make_paths_relative()
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND, copy=True)
    print('SAVED', OUT_BLEND)
if OUT_GLB:
    bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', export_apply=True, export_cameras=True,
                              export_extras=True, export_lights=True, use_mesh_vertices=True, export_gn_mesh=False)
    print('EXPORTED', OUT_GLB)
