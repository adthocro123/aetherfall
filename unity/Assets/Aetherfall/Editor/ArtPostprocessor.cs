using System;
using System.Collections.Generic;
using System.IO;
using Aetherfall.World;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools
{
    /// <summary>
    /// Import rules for every FBX under Assets/Aetherfall/Art/fbx (docs/unity-port.md, "Bring in the art"):
    /// remove Blender's -90 degree X rotation from the model root, keep the flat-shading normals, remap AF_VertexColor /
    /// AF_Glow to the project's two materials, pick the rig from the meta JSON (Generic creatures, Humanoid Pell, no rig
    /// for props), name and loop the clips, turn off root motion, and add the meta JSON's sockets and hit spheres.
    ///
    /// About the axes: art/lib/export.py writes Y-up FBX files and puts Blender's Z-up to Y-up conversion on each
    /// top-level object as a -90 degree X rotation. Unity's standard import then gives exactly the meta and layout
    /// convention (Blender (x, y, z) -> Unity (-x, z, -y), models facing +Z). bakeAxisConversion has no axis system to
    /// bake in these files and turns every model 180 degrees about Y instead (checked against the GLB exports), so it is
    /// off; BakeRootRotation removes the -90 from single-object models, whose object becomes the model root.
    /// </summary>
    public class ArtPostprocessor : AssetPostprocessor
    {
        // Bump when these rules change, so Unity reimports the models.
        public override uint GetVersion() => 3;

        static bool IsArtModel(string path) =>
            path.StartsWith(Paths.Fbx + "/", StringComparison.OrdinalIgnoreCase) &&
            path.EndsWith(".fbx", StringComparison.OrdinalIgnoreCase);

        string AssetName => Path.GetFileNameWithoutExtension(assetPath);

        ArtMeta LoadMeta()
        {
            string metaPath = Paths.MetaPath(AssetName);
            context.DependsOnSourceAsset(metaPath);
            return ArtMeta.Load(metaPath);
        }

        void OnPreprocessModel()
        {
            if (!IsArtModel(assetPath)) return;
            var mi = (ModelImporter)assetImporter;
            ArtMeta meta = LoadMeta();
            if (meta == null) Debug.LogWarning($"[Aetherfall art] {AssetName}: no {Paths.MetaPath(AssetName)}; importing as a prop.");

            mi.globalScale = 1f;
            mi.useFileScale = true;
            mi.bakeAxisConversion = false;              // see the class comment; BakeRootRotation does the job
            mi.importNormals = ModelImporterNormals.Import; // flat shading is baked into the normals
            mi.importTangents = ModelImporterTangents.None; // no UVs or normal maps: colour is all vertex colour
            mi.importBlendShapes = false;
            mi.importCameras = false;
            mi.importLights = false;
            mi.importVisibility = false;
            mi.importConstraints = false;
            mi.addCollider = false;
            // Islands get MeshColliders; batched scatter models are combined at load time, which reads their meshes.
            mi.isReadable = AssetName.StartsWith("Island_", StringComparison.Ordinal) || Paths.BatchedModels.Contains(AssetName);

            mi.materialImportMode = ModelImporterMaterialImportMode.ImportViaMaterialDescription;
            mi.materialLocation = ModelImporterMaterialLocation.InPrefab;
            foreach (var kv in Paths.MaterialRemaps)
            {
                if (!File.Exists(kv.Value))
                {
                    Debug.LogWarning($"[Aetherfall art] {AssetName}: {kv.Value} is missing, so {kv.Key} can't be remapped. " +
                                     "Run Aetherfall > Setup > Apply Project Settings, then reimport the Art folder.");
                    continue;
                }
                context.DependsOnArtifact(kv.Value);
                var mat = AssetDatabase.LoadAssetAtPath<Material>(kv.Value);
                if (mat != null) mi.AddRemap(new AssetImporter.SourceAssetIdentifier(typeof(Material), kv.Key), mat);
            }

            switch (meta?.rig)
            {
                case "Humanoid":
                    // Pell: T-pose, and her bones use Unity's HumanBodyBones names, so the avatar maps itself.
                    mi.animationType = ModelImporterAnimationType.Human;
                    mi.avatarSetup = ModelImporterAvatarSetup.CreateFromThisModel;
                    mi.autoGenerateAvatarMappingIfUnspecified = true;
                    mi.importAnimation = true;
                    break;
                case "Generic":
                    mi.animationType = ModelImporterAnimationType.Generic;
                    mi.avatarSetup = ModelImporterAvatarSetup.CreateFromThisModel;
                    mi.importAnimation = true;
                    break;
                default:
                    mi.animationType = ModelImporterAnimationType.None;
                    mi.importAnimation = false;
                    break;
            }
        }

        void OnPreprocessAnimation()
        {
            if (!IsArtModel(assetPath)) return;
            var mi = (ModelImporter)assetImporter;
            if (mi.animationType == ModelImporterAnimationType.None) return;
            ArtMeta meta = LoadMeta();
            ModelImporterClipAnimation[] takes = mi.defaultClipAnimations;
            if (takes == null || takes.Length == 0) return;

            var clips = new List<ModelImporterClipAnimation>();
            var used = new HashSet<string>();
            foreach (var clip in takes)
            {
                // FBX takes are "<Model>|<Clip>": the clip is called by the part after the bar.
                ArtMeta.Clip m = meta?.ClipForTake(clip.takeName);
                string clipName = m?.name ?? StripTake(clip.takeName);
                if (!used.Add(clipName))
                {
                    Debug.LogWarning($"[Aetherfall art] {AssetName}: skipping take '{clip.takeName}', another take is already called '{clipName}'.");
                    continue;
                }
                clip.name = clipName;
                clip.loopTime = m != null && m.loop;
                if (mi.animationType == ModelImporterAnimationType.Human)
                {
                    // In-place clips: play them exactly as authored, with nothing extracted as root motion.
                    clip.lockRootRotation = true;
                    clip.keepOriginalOrientation = true;
                    clip.lockRootHeightY = true;
                    clip.keepOriginalPositionY = true;
                    clip.lockRootPositionXZ = true;
                    clip.keepOriginalPositionXZ = true;
                }
                clips.Add(clip);
            }
            mi.clipAnimations = clips.ToArray();
        }

        void OnPostprocessModel(GameObject root)
        {
            if (!IsArtModel(assetPath)) return;
            ArtMeta meta = LoadMeta();

            BakeRootRotation(root);
            ReplaceLeftoverMaterials(root);
            var animator = root.GetComponent<Animator>();
            if (animator != null) animator.applyRootMotion = false; // clips animate in place; game code moves creatures

            // EdgeWall is collider-only geometry around each island's rim: keep the mesh, never draw it.
            foreach (var t in root.GetComponentsInChildren<Transform>(true))
                if (t.name.StartsWith("EdgeWall", StringComparison.Ordinal) && t.TryGetComponent(out MeshRenderer mr))
                    UnityEngine.Object.DestroyImmediate(mr);

            if (meta == null) return;
            AddSockets(root, meta);
            AddHitSpheres(root, meta);
        }

        /// <summary>
        /// A file with one top-level object (every prop) imports with that object as the model root, still carrying the
        /// exporter's -90 degree X rotation, which anything that sets the root's rotation would throw away. Bake it into
        /// the root's mesh and its children's transforms, so the root is identity and nothing looks different.
        /// </summary>
        static void BakeRootRotation(GameObject root)
        {
            Transform t = root.transform;
            if (Quaternion.Angle(t.localRotation, Quaternion.identity) < 0.001f) return;
            Quaternion r = SnapToRightAngles(t.localRotation);
            if (t.TryGetComponent(out MeshFilter mf) && mf.sharedMesh != null)
            {
                Mesh mesh = mf.sharedMesh;
                Vector3[] v = mesh.vertices, n = mesh.normals;
                for (int i = 0; i < v.Length; i++) v[i] = r * v[i];
                for (int i = 0; i < n.Length; i++) n[i] = r * n[i];
                mesh.vertices = v;
                if (n.Length == v.Length) mesh.normals = n;
                mesh.RecalculateBounds();
            }
            for (int i = 0; i < t.childCount; i++)
            {
                Transform c = t.GetChild(i);
                c.localPosition = r * c.localPosition;
                c.localRotation = r * c.localRotation;
            }
            t.localRotation = Quaternion.identity;
        }

        /// <summary>FBX import leaves -90 as -89.98 degrees; snap rotations within half a degree of a right angle.</summary>
        static Quaternion SnapToRightAngles(Quaternion q)
        {
            Vector3 Snap(Vector3 v)
            {
                for (int k = 0; k < 3; k++)
                    if (Mathf.Abs(Mathf.Abs(v[k]) - 1f) < 0.0001f || Mathf.Abs(v[k]) < 0.0087f) v[k] = Mathf.Round(v[k]);
                return v.normalized;
            }
            Vector3 f = Snap(q * Vector3.forward), u = Snap(q * Vector3.up);
            return Mathf.Abs(Vector3.Dot(f, u)) < 1e-4f ? Quaternion.LookRotation(f, u) : q;
        }

        void ReplaceLeftoverMaterials(GameObject root)
        {
            foreach (var r in root.GetComponentsInChildren<Renderer>(true))
            {
                Material[] mats = r.sharedMaterials;
                bool changed = false;
                for (int k = 0; k < mats.Length; k++)
                {
                    if (mats[k] == null) continue;
                    string n = mats[k].name;
                    if (n == "M_VertexColor" || n == "M_Glow") continue;
                    if (Paths.MaterialRemaps.TryGetValue(n, out string path) && AssetDatabase.LoadAssetAtPath<Material>(path) is Material m)
                    {
                        mats[k] = m;
                        changed = true;
                    }
                    else
                    {
                        Debug.LogWarning($"[Aetherfall art] {AssetName}: renderer '{r.name}' uses material '{n}', which has no project material.");
                    }
                }
                if (changed) r.sharedMaterials = mats;
            }
        }

        void AddSockets(GameObject root, ArtMeta meta)
        {
            if (meta.sockets.Count == 0) return;
            var list = root.AddComponent<ModelSockets>();
            foreach (var s in meta.sockets)
            {
                Vector3 world = root.transform.TransformPoint(s.position);
                // The Blender scripts export some sockets as empties already (the blades' Base and Tip): use those as they are.
                Transform existing = FindDeep(root.transform, s.name);
                if (existing != null && existing.GetComponent<Renderer>() == null && (existing.position - world).sqrMagnitude < 0.02f * 0.02f)
                {
                    list.sockets.Add(new ModelSockets.Entry { name = s.name, transform = existing });
                    continue;
                }
                Transform parent = root.transform;
                if (!string.IsNullOrEmpty(s.bone))
                {
                    parent = FindDeep(root.transform, s.bone);
                    if (parent == null)
                    {
                        Debug.LogWarning($"[Aetherfall art] {AssetName}: socket '{s.name}' wants bone '{s.bone}', which isn't in the model.");
                        parent = root.transform;
                    }
                }
                var go = new GameObject("Socket_" + s.name);
                go.transform.SetParent(parent, false);
                go.transform.SetPositionAndRotation(world, root.transform.rotation);
                list.sockets.Add(new ModelSockets.Entry { name = s.name, transform = go.transform });
            }
        }

        void AddHitSpheres(GameObject root, ArtMeta meta)
        {
            var names = new HashSet<string>();
            foreach (var h in meta.hitSpheres)
            {
                Transform bone = FindDeep(root.transform, h.bone);
                if (bone == null)
                {
                    Debug.LogWarning($"[Aetherfall art] {AssetName}: hit sphere wants bone '{h.bone}', which isn't in the model.");
                    bone = root.transform;
                }
                string goName = "Hit_" + h.bone;
                for (int k = 2; !names.Add(goName); k++) goName = $"Hit_{h.bone}_{k}";
                var go = new GameObject(goName);
                go.transform.SetParent(bone, false);
                // The centre is in the model root's space at the bind pose.
                go.transform.localPosition = bone.InverseTransformPoint(root.transform.TransformPoint(h.center));
                go.transform.localRotation = Quaternion.identity;
                var sphere = go.AddComponent<SphereCollider>();
                sphere.isTrigger = true;
                Vector3 ls = go.transform.lossyScale;
                float scale = Mathf.Max(Mathf.Abs(ls.x), Mathf.Max(Mathf.Abs(ls.y), Mathf.Abs(ls.z)));
                sphere.radius = h.radius / (scale > 1e-6f ? scale : 1f);
                var zone = go.AddComponent<HitZone>();
                zone.damageMult = h.damageMult;
                zone.when = string.IsNullOrEmpty(h.when) ? "always" : h.when;
            }
        }

        static string StripTake(string take)
        {
            int k = take.LastIndexOf('|');
            return k >= 0 ? take.Substring(k + 1) : take;
        }

        internal static Transform FindDeep(Transform t, string n)
        {
            if (t.name == n) return t;
            for (int k = 0; k < t.childCount; k++)
            {
                Transform r = FindDeep(t.GetChild(k), n);
                if (r != null) return r;
            }
            return null;
        }
    }
}
