using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using Aetherfall.Tools;
using Aetherfall.World;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;

namespace Aetherfall.EditorTools
{
    /// <summary>
    /// Aetherfall > Build World (docs/unity-port.md, "Build the world from layout.json"): places the three islands, their
    /// props, scatter, points and spawns, and the far islands, under one root object in the open scene. Running it again
    /// replaces that root. Grass and flowers are drawn by ScatterBatch; trees, rocks and crystals are static objects.
    /// </summary>
    public static class WorldBuilder
    {
        public const string RootName = "Aetherfall World";

        // Props that move or change in later phases (beam, dummy wobble, current columns) aren't marked static.
        static readonly HashSet<string> MovingProps = new HashSet<string> { "Spire", "TrainingDummy", "Current_Blue", "Current_Gold", "SkyKey" };

        // src/world/world.js: rocks scaled above 0.7 block at 0.85 x scale; crystals block at 0.7 m whatever their scale.
        const float RockBlockMinScale = 0.7f, RockBlockRadius = 0.85f;

        static readonly Dictionary<string, GameObject> models = new Dictionary<string, GameObject>();
        static readonly Dictionary<string, ArtMeta> metas = new Dictionary<string, ArtMeta>();
        static readonly Dictionary<string, float> heights = new Dictionary<string, float>();

        [MenuItem("Aetherfall/Build World", priority = 0)]
        static void BuildMenu()
        {
            Scene scene = SceneManager.GetActiveScene();
            Report report = Build(scene);
            EditorSceneManager.MarkSceneDirty(scene);
            Debug.Log(report);
            var root = scene.GetRootGameObjects().FirstOrDefault(g => g.name == RootName);
            if (root != null) Selection.activeGameObject = root;
            if (report.errors.Count > 0) EditorUtility.DisplayDialog("Build World", report.ToString(), "OK");
        }

        [MenuItem("Aetherfall/Open World Scene", priority = 1)]
        static void OpenWorldScene()
        {
            if (File.Exists(Paths.WorldScene) && EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())
                EditorSceneManager.OpenScene(Paths.WorldScene);
        }

        /// <summary>Unity -batchmode -projectPath unity -executeMethod Aetherfall.EditorTools.WorldBuilder.BuildWorldSceneFromCommandLine</summary>
        public static void BuildWorldSceneFromCommandLine()
        {
            int code = 0;
            try
            {
                Report report = BuildWorldScene();
                Debug.Log(report);
                if (report.errors.Count > 0) code = 2;
            }
            catch (Exception e)
            {
                Debug.LogException(e);
                code = 1;
            }
            EditorApplication.Exit(code);
        }

        /// <summary>Opens (or creates) Assets/Aetherfall/Scenes/World.unity, builds the world in it and saves it.</summary>
        public static Report BuildWorldScene()
        {
            EnsureFolder(Paths.Scenes);
            Scene scene = File.Exists(Paths.WorldScene)
                ? EditorSceneManager.OpenScene(Paths.WorldScene, OpenSceneMode.Single)
                : EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            Report report = Build(scene);
            EditorSceneManager.SaveScene(scene, Paths.WorldScene);
            var scenes = EditorBuildSettings.scenes.Where(s => s.path != Paths.WorldScene).ToList();
            scenes.Insert(0, new EditorBuildSettingsScene(Paths.WorldScene, true));
            EditorBuildSettings.scenes = scenes.ToArray();
            return report;
        }

        public static Report Build(Scene scene)
        {
            models.Clear();
            metas.Clear();
            heights.Clear();
            var report = new Report();
            var layout = J.Obj(MiniJson.Parse(File.ReadAllText(Paths.Layout)));

            foreach (var old in scene.GetRootGameObjects())
                if (old.name == RootName) Object.DestroyImmediate(old);
            var root = new GameObject(RootName);
            SceneManager.MoveGameObjectToScene(root, scene);

            foreach (var kv in J.Obj(layout["islands"]))
                BuildIsland(root.transform, kv.Key, J.Obj(kv.Value), report);

            if (J.Get(layout, "farIslands") is Dictionary<string, object> far)
            {
                GameObject go = Place(J.Str(far, "model", "FarIslands"), root.transform, report);
                if (go != null)
                {
                    go.transform.localPosition = Vector3.zero; // one mesh in world space
                    MakeStatic(go);
                }
            }

            SceneBasics.Ensure(scene);
            return report;
        }

        // ------------------------------------------------------------------ islands

        static void BuildIsland(Transform root, string id, Dictionary<string, object> d, Report report)
        {
            Report.Island stats = report.Add(id);
            string title = J.Str(d, "title", id);
            var island = new GameObject(title);
            island.transform.SetParent(root, false);
            island.transform.localPosition = J.Vec3(d["position"]);
            var info = island.AddComponent<IslandInfo>();
            info.id = id;
            info.title = title;
            info.subtitle = J.Str(d, "subtitle");
            info.radius = J.Num(d, "radius");
            info.edgeRadii = J.Has(d, "edgeRadii") ? J.Floats(d["edgeRadii"]) : new float[0];
            if (info.edgeRadii.Length != 360) report.Error($"{id}: edgeRadii has {info.edgeRadii.Length} entries, not 360");

            // 1. The island itself, with a MeshCollider. EdgeWall stays off: the player controller clamps to edgeRadii,
            //    so knockback can still throw the player off the island.
            GameObject ground = Place(J.Str(d, "model"), island.transform, report);
            if (ground != null)
            {
                foreach (var mf in ground.GetComponentsInChildren<MeshFilter>(true))
                {
                    if (mf.name.StartsWith("EdgeWall", StringComparison.Ordinal))
                    {
                        mf.gameObject.SetActive(false);
                        continue;
                    }
                    mf.gameObject.AddComponent<MeshCollider>().sharedMesh = mf.sharedMesh;
                    stats.colliders++;
                }
                MakeStatic(ground);
            }

            // 2. Props: island-local position, yaw in degrees, scale (a number or per axis).
            Transform props = Group(island.transform, "Props");
            if (J.Get(d, "props") is List<object> list)
                foreach (object o in list)
                {
                    var p = J.Obj(o);
                    string asset = J.Str(p, "asset");
                    stats.propsExpected++;
                    GameObject go = Place(asset, props, report);
                    if (go == null) continue;
                    go.transform.localPosition = J.Vec3(p["position"]);
                    go.transform.localRotation = Quaternion.Euler(0f, J.Num(p, "yaw"), 0f);
                    go.transform.localScale = ScaleOf(J.Get(p, "scale"));
                    if (J.Has(p, "to"))
                    {
                        var current = go.AddComponent<TravelCurrent>();
                        current.to = J.Str(p, "to");
                        current.label = J.Str(p, "label");
                        current.lockedLabel = J.Str(p, "lockedLabel");
                        current.unlock = J.Str(p, "unlock");
                        go.name = $"{asset} to {current.to}";
                    }
                    stats.colliders += AddBlockers(go, asset, 1f, absolute: false);
                    if (!MovingProps.Contains(asset)) MakeStatic(go);
                    stats.props++;
                }

            // 3. Scatter rows: [x, y, z, yaw, scale] plus an optional [r, g, b] tint.
            Transform scatter = Group(island.transform, "Scatter");
            if (J.Get(d, "scatter") is Dictionary<string, object> sc)
                foreach (var kv in sc)
                {
                    string asset = kv.Key;
                    List<object> rows = J.Arr(kv.Value);
                    stats.scatterExpected += rows.Count;
                    if (Paths.BatchedModels.Contains(asset))
                    {
                        int n = Batch(asset, rows, scatter, report, out int cells);
                        stats.scatter += n;
                        stats.batched += n;
                        stats.batchCells += cells;
                        continue;
                    }
                    Transform group = Group(scatter, asset);
                    foreach (object r0 in rows)
                    {
                        float[] r = J.Floats(r0);
                        GameObject go = Place(asset, group, report);
                        if (go == null) continue;
                        go.transform.localPosition = new Vector3(r[0], r[1], r[2]);
                        go.transform.localRotation = Quaternion.Euler(0f, r[3], 0f);
                        go.transform.localScale = Vector3.one * r[4];
                        if (r.Length >= 8 && (r[5] != 1f || r[6] != 1f || r[7] != 1f))
                            go.AddComponent<InstanceTint>().tint = new Color(r[5], r[6], r[7], 1f);
                        if (asset.StartsWith("Tree_", StringComparison.Ordinal))
                            stats.colliders += AddBlockers(go, asset, r[4], absolute: false);
                        else if (asset.StartsWith("Crystal_", StringComparison.Ordinal))
                            stats.colliders += AddBlockers(go, asset, r[4], absolute: true);
                        else if (asset.StartsWith("Rock_", StringComparison.Ordinal) && r[4] > RockBlockMinScale)
                            stats.colliders += AddCapsule(go, Vector3.zero, RockBlockRadius, ModelHeight(asset));
                        MakeStatic(go);
                        stats.scatter++;
                    }
                }

            // 4. Named points and enemy spawns, as empty markers for gameplay code to find.
            Transform points = Group(island.transform, "Points");
            if (J.Get(d, "points") is Dictionary<string, object> pts)
                foreach (var kv in pts)
                {
                    var p = J.Obj(kv.Value);
                    var go = new GameObject(kv.Key);
                    go.transform.SetParent(points, false);
                    go.transform.localPosition = J.Vec3(p["position"]);
                    if (J.Has(p, "yaw")) go.transform.localRotation = Quaternion.Euler(0f, J.Num(p, "yaw"), 0f);
                    var wp = go.AddComponent<WorldPoint>();
                    wp.id = kv.Key;
                    wp.radius = J.Num(p, "radius");
                    wp.wakeRadius = J.Num(p, "wakeRadius");
                    wp.interactRadius = J.Num(p, "interactRadius");
                    wp.note = J.Str(p, "note");
                    stats.points++;
                }
            if (J.Get(d, "spawns") is List<object> spawns)
            {
                Transform group = Group(island.transform, "Spawns");
                foreach (object o in spawns)
                {
                    var s = J.Obj(o);
                    string type = J.Str(s, "type");
                    int count = Mathf.Max(1, Mathf.RoundToInt(J.Num(s, "count", 1f)));
                    var go = new GameObject($"{type} x{count}");
                    go.transform.SetParent(group, false);
                    go.transform.localPosition = J.Vec3(s["position"]);
                    var sp = go.AddComponent<SpawnPoint>();
                    sp.enemyType = type;
                    sp.count = count;
                    stats.spawns++;
                    stats.enemies += count;
                }
            }
        }

        /// <summary>Grass tufts and flowers: one ScatterBatch per model, drawn as combined meshes per 16 m cell.</summary>
        static int Batch(string asset, List<object> rows, Transform parent, Report report, out int cells)
        {
            cells = 0;
            GameObject model = Model(asset, report);
            if (model == null) return 0;
            var go = new GameObject($"{asset} (batched)");
            go.transform.SetParent(parent, false);
            var batch = go.AddComponent<ScatterBatch>();
            Matrix4x4 toModel = model.transform.worldToLocalMatrix;
            foreach (var mr in model.GetComponentsInChildren<MeshRenderer>(true))
            {
                var mf = mr.GetComponent<MeshFilter>();
                if (mf == null || mf.sharedMesh == null) continue;
                batch.parts.Add(new ScatterBatch.Part { mesh = mf.sharedMesh, materials = mr.sharedMaterials, matrix = toModel * mr.transform.localToWorldMatrix });
            }
            foreach (object r0 in rows)
            {
                float[] r = J.Floats(r0);
                batch.instances.Add(new ScatterBatch.Instance
                {
                    position = new Vector3(r[0], r[1], r[2]),
                    yaw = r[3],
                    scale = r[4],
                    tint = r.Length >= 8 ? new Vector3(r[5], r[6], r[7]) : Vector3.one,
                });
            }
            batch.Rebuild();
            cells = batch.CellCount;
            if (cells == 0) report.Error($"{asset}: ScatterBatch built no meshes (is the model's mesh readable?)");
            return rows.Count;
        }

        // ------------------------------------------------------------------ colliders

        /// <summary>
        /// The web game blocks movement with circles in the ground plane (world.js collide); here they're upright capsules.
        /// absolute: the meta radius is in metres whatever the instance scale (crystals); otherwise it scales with it.
        /// </summary>
        static int AddBlockers(GameObject go, string asset, float scale, bool absolute)
        {
            ArtMeta meta = Meta(asset);
            if (meta == null || meta.blockers.Count == 0) return 0;
            float height = meta.blockerHeight > 0f ? meta.blockerHeight : ModelHeight(asset);
            int n = 0;
            foreach (var b in meta.blockers)
                n += AddCapsule(go, b.center, absolute && scale > 0f ? b.radius / scale : b.radius, height);
            return n;
        }

        static int AddCapsule(GameObject go, Vector3 center, float radius, float height)
        {
            var cap = go.AddComponent<CapsuleCollider>();
            cap.direction = 1;
            cap.radius = radius;
            cap.height = Mathf.Max(height, radius * 2f);
            cap.center = new Vector3(center.x, cap.height * 0.5f, center.z);
            return 1;
        }

        /// <summary>Height of a model above its pivot (pivots sit on the ground), from its meshes.</summary>
        static float ModelHeight(string asset)
        {
            if (heights.TryGetValue(asset, out float h)) return h;
            h = 1f;
            GameObject model = Model(asset, null);
            if (model != null)
            {
                Matrix4x4 toModel = model.transform.worldToLocalMatrix;
                float top = float.MinValue;
                foreach (var mf in model.GetComponentsInChildren<MeshFilter>(true))
                {
                    if (mf.sharedMesh == null) continue;
                    Bounds b = mf.sharedMesh.bounds;
                    Matrix4x4 m = toModel * mf.transform.localToWorldMatrix;
                    for (int i = 0; i < 8; i++)
                    {
                        var corner = new Vector3((i & 1) == 0 ? b.min.x : b.max.x, (i & 2) == 0 ? b.min.y : b.max.y, (i & 4) == 0 ? b.min.z : b.max.z);
                        top = Mathf.Max(top, m.MultiplyPoint3x4(corner).y);
                    }
                }
                if (top > 0f) h = top;
            }
            heights[asset] = h;
            return h;
        }

        // ------------------------------------------------------------------ helpers

        static GameObject Model(string asset, Report report)
        {
            if (models.TryGetValue(asset, out GameObject m)) return m;
            m = AssetDatabase.LoadAssetAtPath<GameObject>(Paths.ModelPath(asset));
            if (m == null) report?.Error($"no model at {Paths.ModelPath(asset)}");
            models[asset] = m;
            return m;
        }

        static ArtMeta Meta(string asset)
        {
            if (!metas.TryGetValue(asset, out ArtMeta m)) metas[asset] = m = ArtMeta.Load(Paths.MetaPath(asset));
            return m;
        }

        static GameObject Place(string asset, Transform parent, Report report)
        {
            GameObject model = Model(asset, report);
            if (model == null) return null;
            return (GameObject)PrefabUtility.InstantiatePrefab(model, parent);
        }

        static Transform Group(Transform parent, string name)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            return go.transform;
        }

        static Vector3 ScaleOf(object o)
        {
            if (o is double d) return Vector3.one * (float)d;
            if (o is List<object>) return J.Vec3(o);
            return Vector3.one;
        }

        static void MakeStatic(GameObject go)
        {
            const StaticEditorFlags flags = StaticEditorFlags.BatchingStatic | StaticEditorFlags.OccludeeStatic | StaticEditorFlags.OccluderStatic;
            foreach (var t in go.GetComponentsInChildren<Transform>(true))
                GameObjectUtility.SetStaticEditorFlags(t.gameObject, flags);
        }

        internal static void EnsureFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;
            string parent = Path.GetDirectoryName(path)?.Replace('\\', '/');
            if (!string.IsNullOrEmpty(parent)) EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, Path.GetFileName(path));
        }

        // ------------------------------------------------------------------ report

        public sealed class Report
        {
            public sealed class Island
            {
                public string id;
                public int props, propsExpected, scatter, scatterExpected, batched, batchCells, points, spawns, enemies, colliders;
                public bool Complete => props == propsExpected && scatter == scatterExpected;
            }

            public readonly List<Island> islands = new List<Island>();
            public readonly List<string> errors = new List<string>();

            public Island Add(string id)
            {
                var i = new Island { id = id };
                islands.Add(i);
                return i;
            }

            public void Error(string e)
            {
                if (!errors.Contains(e)) errors.Add(e);
            }

            public override string ToString()
            {
                var sb = new StringBuilder();
                bool ok = errors.Count == 0 && islands.All(i => i.Complete);
                sb.AppendLine($"[Aetherfall] Build World: {(ok ? "OK" : "INCOMPLETE")}, {islands.Count} islands");
                foreach (var i in islands)
                    sb.AppendLine($"  {i.id}: props {i.props}/{i.propsExpected}, scatter {i.scatter}/{i.scatterExpected} " +
                                  $"({i.batched} grass and flowers batched in {i.batchCells} meshes), {i.points} points, " +
                                  $"{i.spawns} spawns ({i.enemies} enemies), {i.colliders} colliders");
                foreach (var e in errors) sb.AppendLine("  error: " + e);
                return sb.ToString();
            }
        }
    }

    /// <summary>
    /// What a World scene needs besides the world: the sun, the web game's fog and hemisphere light, a camera that can fly
    /// around, and a global volume. Only adds what the scene doesn't have, so hand edits survive a rebuild.
    /// </summary>
    static class SceneBasics
    {
        // src/world/sky.js and src/main.js. three.js light intensities include a 1/pi that Unity's lighting doesn't,
        // so the sun (2.5) and the hemisphere light (1.35) are divided by pi.
        static readonly Vector3 ToSun = new Vector3(0.52f, 0.27f, -0.81f).normalized; // web sunDir with x mirrored
        const float SunIntensity = 2.5f / Mathf.PI, HemiIntensity = 1.35f / Mathf.PI;

        public static void Ensure(Scene scene)
        {
            var roots = scene.GetRootGameObjects();

            Light sun = roots.SelectMany(r => r.GetComponentsInChildren<Light>(true)).FirstOrDefault(l => l.type == LightType.Directional);
            if (sun == null)
            {
                var go = new GameObject("Sun");
                SceneManager.MoveGameObjectToScene(go, scene);
                sun = go.AddComponent<Light>();
                sun.type = LightType.Directional;
                sun.color = Hex(0xffe0be);
                sun.intensity = SunIntensity;
                sun.shadows = LightShadows.Soft;
                sun.shadowStrength = 0.7f;
                go.transform.rotation = Quaternion.LookRotation(-ToSun);

                RenderSettings.sun = sun;
                RenderSettings.fog = true;
                RenderSettings.fogMode = FogMode.Linear;
                RenderSettings.fogColor = Hex(0xb8cff7);
                RenderSettings.fogStartDistance = 170f;
                RenderSettings.fogEndDistance = 1200f;
                RenderSettings.ambientMode = AmbientMode.Trilight;
                RenderSettings.ambientSkyColor = Scaled(0xd2e2ff, HemiIntensity);
                RenderSettings.ambientEquatorColor = Scaled(Mix(0xd2e2ff, 0x7a6688), HemiIntensity);
                RenderSettings.ambientGroundColor = Scaled(0x7a6688, HemiIntensity);
                RenderSettings.skybox = null;
                RenderSettings.defaultReflectionMode = DefaultReflectionMode.Custom;
                DynamicGI.UpdateEnvironment();
            }

            Camera cam = roots.SelectMany(r => r.GetComponentsInChildren<Camera>(true)).FirstOrDefault();
            if (cam == null)
            {
                var go = new GameObject("Main Camera") { tag = "MainCamera" };
                SceneManager.MoveGameObjectToScene(go, scene);
                cam = go.AddComponent<Camera>();
                go.AddComponent<AudioListener>();
                cam.clearFlags = CameraClearFlags.SolidColor;
                cam.backgroundColor = Hex(0xb8cff7);
                cam.fieldOfView = 74f;       // the web camera
                cam.nearClipPlane = 0.05f;
                cam.farClipPlane = 2500f;
                go.AddComponent<UniversalAdditionalCameraData>().renderPostProcessing = true;
                go.AddComponent<FreeFlyCamera>();
                // Over Skyreach's landing, looking across the island to the spire and the camp.
                go.transform.position = new Vector3(-24f, 9f, 14f);
                go.transform.LookAt(new Vector3(0f, 1.5f, -2f));
            }

            Volume volume = roots.SelectMany(r => r.GetComponentsInChildren<Volume>(true)).FirstOrDefault(v => v.isGlobal);
            if (volume == null)
            {
                var go = new GameObject("Global Volume");
                SceneManager.MoveGameObjectToScene(go, scene);
                volume = go.AddComponent<Volume>();
                volume.isGlobal = true;
                volume.sharedProfile = WorldProfile();
            }
        }

        /// <summary>
        /// The web game's exposure (1.05) and a soft bloom for the glowing parts (PC only). The web's NeutralToneMapping
        /// (Khronos PBR Neutral) leaves colours below 0.76 alone; URP's Neutral is a different curve that turns the
        /// sky and fog grey, so tone mapping is off here.
        /// </summary>
        static VolumeProfile WorldProfile()
        {
            var profile = AssetDatabase.LoadAssetAtPath<VolumeProfile>(Paths.WorldVolumeProfile);
            if (profile != null) return profile;
            WorldBuilder.EnsureFolder(Paths.Settings);
            profile = ScriptableObject.CreateInstance<VolumeProfile>();
            AssetDatabase.CreateAsset(profile, Paths.WorldVolumeProfile);
            var tonemap = profile.Add<Tonemapping>(true);
            tonemap.mode.Override(TonemappingMode.None);
            var color = profile.Add<ColorAdjustments>(true);
            color.postExposure.Override(Mathf.Log(1.05f, 2f));
            var bloom = profile.Add<Bloom>(true);
            bloom.threshold.Override(1f);
            bloom.intensity.Override(0.35f);
            bloom.scatter.Override(0.6f);
            foreach (var c in profile.components)
            {
                c.hideFlags = HideFlags.HideInInspector | HideFlags.HideInHierarchy;
                AssetDatabase.AddObjectToAsset(c, profile);
            }
            EditorUtility.SetDirty(profile);
            AssetDatabase.SaveAssets();
            return profile;
        }

        static Color Hex(int rgb) => new Color(((rgb >> 16) & 255) / 255f, ((rgb >> 8) & 255) / 255f, (rgb & 255) / 255f, 1f);

        static Color Mix(int a, int b)
        {
            Color ca = Hex(a).linear, cb = Hex(b).linear;
            return ((ca + cb) * 0.5f).gamma;
        }

        static Color Scaled(int rgb, float k) => Scaled(Hex(rgb), k);

        /// <summary>Scales a colour's light (in linear space) and returns it in the sRGB form RenderSettings expects.</summary>
        static Color Scaled(Color c, float k)
        {
            Color lin = c.linear * k;
            lin.a = 1f;
            return lin.gamma;
        }
    }
}
