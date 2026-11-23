using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using Unity.XR.CoreUtils.Editor;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.PackageManager.UI;
using UnityEditor.XR.Management;
using UnityEditor.XR.Management.Metadata;
using UnityEditor.XR.OpenXR.Features;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.XR.Management;
using UnityEngine.XR.OpenXR;

namespace Aetherfall.EditorTools
{
    /// <summary>
    /// The project settings from docs/unity-port.md, section 1: player and input settings, the PC and Quest URP assets,
    /// OpenXR for Standalone and Android with the Meta Quest feature group and controller profiles, the two materials,
    /// XR Interaction Toolkit's Starter Assets, and Project Validation's automatic fixes. Safe to run again.
    /// </summary>
    public static class ProjectSetup
    {
        const string Tag = "[Aetherfall setup]";
        const string OpenXRLoader = "UnityEngine.XR.OpenXR.OpenXRLoader";

        [MenuItem("Aetherfall/Setup/Apply Project Settings", priority = 100)]
        static void ApplyMenu() => Apply();

        /// <summary>Unity -batchmode -projectPath unity -executeMethod Aetherfall.EditorTools.ProjectSetup.ApplyFromCommandLine</summary>
        public static void ApplyFromCommandLine()
        {
            int code = 0;
            try { Apply(); }
            catch (Exception e) { Debug.LogException(e); code = 1; }
            EditorApplication.Exit(code);
        }

        public static void Apply()
        {
            Player();
            RenderPipelines();
            Xr();
            MaterialSetup.EnsureMaterials();
            ImportXriStarterAssets();
            AssetDatabase.SaveAssets();
            FixProjectValidation(BuildTargetGroup.Standalone);
            FixProjectValidation(BuildTargetGroup.Android);
            AssetDatabase.SaveAssets();
            Debug.Log($"{Tag} done");
        }

        // ------------------------------------------------------------------ player

        static void Player()
        {
            PlayerSettings.productName = "Aetherfall";
            PlayerSettings.colorSpace = ColorSpace.Linear;

            // Player > Active Input Handling: Input System Package (New). There's no public API for it.
            var player = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset").FirstOrDefault();
            if (player != null)
            {
                var so = new SerializedObject(player);
                var p = so.FindProperty("activeInputHandler");
                if (p != null && p.intValue != 1)
                {
                    p.intValue = 1;
                    so.ApplyModifiedPropertiesWithoutUndo();
                }
            }

            // Quest (Android): what Project Validation asks for. Set here too, in case the Android module isn't installed.
            PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel32;
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.Android, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.Android, new[] { GraphicsDeviceType.Vulkan });
            Debug.Log($"{Tag} player: Aetherfall, linear colour, Input System; Android: API 32+, ARM64, IL2CPP, Vulkan");
        }

        // ------------------------------------------------------------------ render pipelines

        const string Settings = "Assets/Settings";

        static void RenderPipelines()
        {
            // The template's Mobile assets become the Quest ones (renaming keeps their GUIDs and references).
            RenameAsset($"{Settings}/Mobile_RPAsset.asset", "Quest_RPAsset");
            RenameAsset($"{Settings}/Mobile_Renderer.asset", "Quest_Renderer");
            RenameQualityLevel("Mobile", "Quest");

            var pc = Load<UniversalRenderPipelineAsset>($"{Settings}/PC_RPAsset.asset");
            var quest = Load<UniversalRenderPipelineAsset>($"{Settings}/Quest_RPAsset.asset");
            var pcRenderer = Load<UniversalRendererData>($"{Settings}/PC_Renderer.asset");
            var questRenderer = Load<UniversalRendererData>($"{Settings}/Quest_Renderer.asset");

            // PC: Forward+, MSAA 4x, HDR on, post-processing (bloom) allowed.
            pc.msaaSampleCount = 4;
            pc.supportsHDR = true;
            pcRenderer.renderingMode = RenderingMode.ForwardPlus;

            // Quest: Forward, MSAA 4x, HDR off, no post-processing.
            quest.msaaSampleCount = 4;
            quest.supportsHDR = false;
            questRenderer.renderingMode = RenderingMode.Forward;
            questRenderer.postProcessData = null;

            foreach (var o in new UnityEngine.Object[] { pc, quest, pcRenderer, questRenderer }) EditorUtility.SetDirty(o);
            Debug.Log($"{Tag} URP: PC_RPAsset (Forward+, MSAA 4x, HDR) and Quest_RPAsset (Forward, MSAA 4x, no HDR, no post); quality levels PC and Quest");
        }

        static T Load<T>(string path) where T : UnityEngine.Object =>
            AssetDatabase.LoadAssetAtPath<T>(path) ?? throw new FileNotFoundException($"{Tag} missing {path}");

        static void RenameAsset(string path, string newName)
        {
            if (!File.Exists(path)) return;
            string err = AssetDatabase.RenameAsset(path, newName);
            if (!string.IsNullOrEmpty(err)) throw new Exception($"{Tag} couldn't rename {path}: {err}");
        }

        static void RenameQualityLevel(string from, string to)
        {
            var qs = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/QualitySettings.asset").FirstOrDefault();
            if (qs == null) return;
            var so = new SerializedObject(qs);
            var levels = so.FindProperty("m_QualitySettings");
            for (int i = 0; i < levels.arraySize; i++)
            {
                var n = levels.GetArrayElementAtIndex(i).FindPropertyRelative("name");
                if (n.stringValue == from) n.stringValue = to;
            }
            so.ApplyModifiedPropertiesWithoutUndo();
        }

        // ------------------------------------------------------------------ XR

        static void Xr()
        {
            var perTarget = XrSettingsPerBuildTarget();
            // PC: OpenXR is there for PC VR but doesn't start with the game, so desktop play (and Play mode with a
            // headset runtime installed) stays flat until VR is started on purpose (phase 5). Quest starts in VR.
            UseOpenXR(perTarget, BuildTargetGroup.Standalone, initOnStart: false);
            UseOpenXR(perTarget, BuildTargetGroup.Android, initOnStart: true);

            EnableMetaFeatureGroup();
            EnableFeatures(BuildTargetGroup.Android, "MetaQuestFeature", "OculusTouchControllerProfile", "MetaQuestTouchPlusControllerProfile");
            EnableFeatures(BuildTargetGroup.Standalone, "OculusTouchControllerProfile", "MetaQuestTouchPlusControllerProfile",
                           "ValveIndexControllerProfile", "HTCViveControllerProfile");
        }

        static XRGeneralSettingsPerBuildTarget XrSettingsPerBuildTarget()
        {
            if (EditorBuildSettings.TryGetConfigObject(XRGeneralSettings.k_SettingsKey, out XRGeneralSettingsPerBuildTarget existing) && existing != null)
                return existing;
            if (!AssetDatabase.IsValidFolder("Assets/XR")) AssetDatabase.CreateFolder("Assets", "XR");
            var s = ScriptableObject.CreateInstance<XRGeneralSettingsPerBuildTarget>();
            AssetDatabase.CreateAsset(s, "Assets/XR/XRGeneralSettingsPerBuildTarget.asset");
            EditorBuildSettings.AddConfigObject(XRGeneralSettings.k_SettingsKey, s, true);
            return s;
        }

        static void UseOpenXR(XRGeneralSettingsPerBuildTarget perTarget, BuildTargetGroup group, bool initOnStart)
        {
            if (!perTarget.HasSettingsForBuildTarget(group)) perTarget.CreateDefaultSettingsForBuildTarget(group);
            if (!perTarget.HasManagerSettingsForBuildTarget(group)) perTarget.CreateDefaultManagerSettingsForBuildTarget(group);
            XRGeneralSettings general = perTarget.SettingsForBuildTarget(group);
            general.InitManagerOnStart = initOnStart;
            EditorUtility.SetDirty(general);
            bool assigned = XRPackageMetadataStore.AssignLoader(general.AssignedSettings, OpenXRLoader, group);
            bool active = general.AssignedSettings.activeLoaders.Any(l => l != null && l.GetType().FullName == OpenXRLoader);
            Debug.Log($"{Tag} XR Plug-in Management {group}: OpenXR {(active ? "on" : assigned ? "assigned" : "NOT assigned")}, " +
                      $"initialize on startup {(initOnStart ? "on" : "off")}");
        }

        static void EnableMetaFeatureGroup()
        {
            const BuildTargetGroup group = BuildTargetGroup.Android;
            foreach (string id in new[] { "com.unity.openxr.featureset.meta", "com.unity.xr.meta-openxr.featureset" })
            {
                var set = OpenXRFeatureSetManager.GetFeatureSetWithId(group, id);
                if (set == null) continue;
                set.isEnabled = true;
                OpenXRFeatureSetManager.SetFeaturesFromEnabledFeatureSets(group);
                Debug.Log($"{Tag} OpenXR Android: feature group '{set.name}' ({id}) on");
                return;
            }
            Debug.LogWarning($"{Tag} OpenXR Android: no Meta feature group found. Feature groups here: {DescribeFeatureSets(group)}");
        }

        static string DescribeFeatureSets(BuildTargetGroup group)
        {
            var m = typeof(OpenXRFeatureSetManager).GetMethod("FeatureSetsForBuildTarget", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
            if (m?.Invoke(null, new object[] { group }) is System.Collections.IEnumerable sets)
            {
                var names = new List<string>();
                foreach (object s in sets)
                {
                    var t = s.GetType();
                    string id = t.GetField("featureSetId")?.GetValue(s) as string ?? t.GetProperty("featureSetId")?.GetValue(s) as string;
                    names.Add(id ?? s.ToString());
                }
                return string.Join(", ", names);
            }
            return "(unknown)";
        }

        static void EnableFeatures(BuildTargetGroup group, params string[] typeNames)
        {
            OpenXRSettings settings = OpenXRSettings.GetSettingsForBuildTargetGroup(group);
            if (settings == null)
            {
                Debug.LogWarning($"{Tag} OpenXR {group}: no settings");
                return;
            }
            var wanted = new HashSet<string>(typeNames);
            var on = new List<string>();
            foreach (var f in settings.GetFeatures())
            {
                if (f == null || !wanted.Contains(f.GetType().Name)) continue;
                if (!f.enabled)
                {
                    f.enabled = true;
                    EditorUtility.SetDirty(f);
                }
                on.Add(f.GetType().Name);
            }
            var missing = wanted.Except(on).ToList();
            Debug.Log($"{Tag} OpenXR {group}: on: {string.Join(", ", on)}" + (missing.Count > 0 ? $"; not found: {string.Join(", ", missing)}" : ""));
        }

        // ------------------------------------------------------------------ XR Interaction Toolkit sample

        static void ImportXriStarterAssets()
        {
            foreach (var sample in Sample.FindByPackage("com.unity.xr.interaction.toolkit", null))
            {
                if (sample.displayName != "Starter Assets") continue;
                if (sample.isImported)
                {
                    Debug.Log($"{Tag} XRI Starter Assets: already imported");
                    return;
                }
                bool ok = sample.Import(Sample.ImportOptions.OverridePreviousImports | Sample.ImportOptions.HideImportWindow);
                Debug.Log($"{Tag} XRI Starter Assets: {(ok ? "imported" : "import FAILED")} to {sample.importPath}");
                return;
            }
            Debug.LogWarning($"{Tag} XRI Starter Assets: sample not found");
        }

        // ------------------------------------------------------------------ Project Validation

        /// <summary>Runs Project Validation (XR Core Utils' BuildValidator) and applies every automatic fix it offers.</summary>
        static void FixProjectValidation(BuildTargetGroup group)
        {
            var get = typeof(BuildValidator).GetMethod("GetCurrentValidationIssues", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic,
                                                       null, new[] { typeof(HashSet<BuildValidationRule>), typeof(BuildTargetGroup) }, null);
            if (get == null)
            {
                Debug.LogWarning($"{Tag} Project Validation: BuildValidator.GetCurrentValidationIssues not found; run it from Project Settings > XR Plug-in Management.");
                return;
            }
            var issues = new HashSet<BuildValidationRule>();
            // Some fixes only show as fixed after scripts recompile (they add scripting defines), so try each once.
            var tried = new HashSet<string>();
            for (int pass = 0; pass < 4; pass++)
            {
                issues.Clear();
                get.Invoke(null, new object[] { issues, group });
                var fixable = issues.Where(r => r.FixItAutomatic && r.FixIt != null && tried.Add(r.Message)).ToList();
                if (fixable.Count == 0) break;
                foreach (var rule in fixable)
                {
                    try
                    {
                        rule.FixIt();
                        Debug.Log($"{Tag} Project Validation {group}: fixed: {rule.Message}");
                    }
                    catch (Exception e)
                    {
                        Debug.LogWarning($"{Tag} Project Validation {group}: fix failed for '{rule.Message}': {e.Message}");
                    }
                }
                AssetDatabase.SaveAssets();
            }
            issues.Clear();
            get.Invoke(null, new object[] { issues, group });
            if (issues.Count == 0) Debug.Log($"{Tag} Project Validation {group}: no issues");
            foreach (var r in issues)
                Debug.Log($"{Tag} Project Validation {group}: still flagged ({(r.Error ? "error" : "warning")}, " +
                          $"{(r.FixItAutomatic ? "auto-fix" : "manual")}): [{r.Category}] {r.Message}");
        }
    }

    /// <summary>The two shared materials: M_VertexColor (Lit, GPU instancing) and M_Glow (additive).</summary>
    public static class MaterialSetup
    {
        public static void EnsureMaterials()
        {
            bool created = Ensure(Paths.VertexColorMaterial, Paths.VertexColorShader);
            created |= Ensure(Paths.GlowMaterial, Paths.GlowShader);
            // Models imported before the materials existed kept Blender's materials: import them again to remap.
            if (created && AssetDatabase.IsValidFolder(Paths.Fbx))
                AssetDatabase.ImportAsset(Paths.Fbx, ImportAssetOptions.ImportRecursive | ImportAssetOptions.ForceUpdate);
        }

        static bool Ensure(string materialPath, string shaderPath)
        {
            var shader = AssetDatabase.LoadAssetAtPath<Shader>(shaderPath);
            if (shader == null) throw new Exception($"[Aetherfall setup] {shaderPath} did not import as a shader");
            var messages = ShaderUtil.GetShaderMessages(shader);
            foreach (var m in messages)
                Debug.Log($"[Aetherfall setup] {shader.name} {m.severity}: {m.message} ({m.file}:{m.line})");
            if (ShaderUtil.ShaderHasError(shader)) throw new Exception($"[Aetherfall setup] {shader.name} has errors");

            var mat = AssetDatabase.LoadAssetAtPath<Material>(materialPath);
            bool created = false;
            if (mat == null)
            {
                if (!AssetDatabase.IsValidFolder(Paths.Materials)) AssetDatabase.CreateFolder(Paths.Root, "Materials");
                mat = new Material(shader) { name = Path.GetFileNameWithoutExtension(materialPath) };
                AssetDatabase.CreateAsset(mat, materialPath);
                created = true;
            }
            else if (mat.shader != shader)
            {
                mat.shader = shader;
            }
            mat.enableInstancing = true;
            EditorUtility.SetDirty(mat);
            Debug.Log($"[Aetherfall setup] {materialPath}: shader {shader.name}, {shader.passCount} passes" + (created ? " (created)" : ""));
            return created;
        }
    }
}
