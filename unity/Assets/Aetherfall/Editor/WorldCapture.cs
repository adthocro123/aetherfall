using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Aetherfall.World;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using Object = UnityEngine.Object;

namespace Aetherfall.EditorTools
{
    /// <summary>
    /// Aetherfall > Capture World Screenshots: renders a set of views of the built world to unity/Captures/*.png, through
    /// the same URP pipeline and camera settings as the scene's main camera. Works in batch mode (not with -nographics).
    /// </summary>
    public static class WorldCapture
    {
        public const string Folder = "Captures";

        struct Shot
        {
            public string name;
            public Vector3 position, target;
            public float fov;

            public Shot(string name, Vector3 position, Vector3 target, float fov)
            {
                this.name = name;
                this.position = position;
                this.target = target;
                this.fov = fov;
            }
        }

        [MenuItem("Aetherfall/Capture World Screenshots", priority = 20)]
        static void CaptureMenu()
        {
            List<string> files = Capture();
            if (files.Count > 0) EditorUtility.RevealInFinder(files[0]);
        }

        /// <summary>Unity -batchmode -projectPath unity -executeMethod Aetherfall.EditorTools.WorldCapture.CaptureFromCommandLine</summary>
        public static void CaptureFromCommandLine()
        {
            int code = 0;
            try
            {
                EditorSceneManager.OpenScene(Paths.WorldScene, OpenSceneMode.Single);
                foreach (string f in Capture()) Debug.Log($"[Aetherfall capture] wrote {f}");
            }
            catch (Exception e)
            {
                Debug.LogException(e);
                code = 1;
            }
            EditorApplication.Exit(code);
        }

        public static List<string> Capture(int width = 1600, int height = 900)
        {
            var islands = Object.FindObjectsByType<IslandInfo>(FindObjectsInactive.Exclude, FindObjectsSortMode.None).ToDictionary(i => i.id, i => i.transform.position);
            if (!islands.TryGetValue("skyreach", out Vector3 sky) || !islands.TryGetValue("verdant", out Vector3 ver) || !islands.TryGetValue("warden", out Vector3 war))
                throw new Exception("Build the world first (Aetherfall > Build World): the scene has no skyreach, verdant and warden islands.");
            Vector3 mid = (sky + ver + war) / 3f;

            var shots = new List<Shot>
            {
                new Shot("1_overview", mid + new Vector3(105f, 72f, 140f), mid + new Vector3(-6f, -10f, 0f), 50f),
                new Shot("2_skyreach", sky + new Vector3(26f, 15f, 24f), sky + new Vector3(-3f, 1f, -3f), 60f),
                new Shot("3_skyreach_landing", sky + new Vector3(-14.5f, 0.45f + 1.62f, -2f), sky + new Vector3(0f, 2.2f, -6f), 74f),
                new Shot("4_verdant", ver + new Vector3(44f, 26f, 42f), ver + new Vector3(-2f, 0f, -2f), 60f),
                new Shot("5_verdant_meadow", ver + new Vector3(24.5f, 0.3f + 1.62f, 0f), ver + new Vector3(0f, 1.5f, 4f), 74f),
                new Shot("6_warden", war + new Vector3(30f, 18f, 32f), war + new Vector3(0f, 2f, 0f), 60f),
                new Shot("7_warden_arena", war + new Vector3(0f, 0.2f + 1.62f, 18.5f), war + new Vector3(0f, 2.5f, 0f), 74f),
            };

            Camera main = Camera.main != null ? Camera.main : Object.FindFirstObjectByType<Camera>();
            var go = new GameObject("Capture Camera") { hideFlags = HideFlags.HideAndDontSave };
            var cam = go.AddComponent<Camera>();
            if (main != null)
            {
                cam.CopyFrom(main);
                cam.targetTexture = null;
            }
            else
            {
                cam.clearFlags = CameraClearFlags.SolidColor;
                cam.backgroundColor = new Color(0.72f, 0.81f, 0.97f);
                cam.farClipPlane = 2500f;
            }
            var data = go.AddComponent<UniversalAdditionalCameraData>();
            data.renderPostProcessing = true;
            data.antialiasing = AntialiasingMode.SubpixelMorphologicalAntiAliasing;

            Directory.CreateDirectory(Folder);
            bool async = ShaderUtil.allowAsyncCompilation;
            ShaderUtil.allowAsyncCompilation = false; // render real shaders, not the compile-in-progress placeholder
            var files = new List<string>();
            try
            {
                foreach (var shot in shots)
                {
                    cam.transform.position = shot.position;
                    cam.transform.LookAt(shot.target);
                    cam.fieldOfView = shot.fov;
                    string path = Path.GetFullPath(Path.Combine(Folder, shot.name + ".png"));
                    Render(cam, width, height, path);
                    files.Add(path);
                }
            }
            finally
            {
                ShaderUtil.allowAsyncCompilation = async;
                Object.DestroyImmediate(go);
            }
            return files;
        }

        static void Render(Camera cam, int width, int height, string path)
        {
            var rt = new RenderTexture(new RenderTextureDescriptor(width, height, RenderTextureFormat.ARGB32, 24) { sRGB = true, msaaSamples = 1 });
            rt.Create();
            var request = new RenderPipeline.StandardRequest { destination = rt };
            for (int pass = 0; pass < 2; pass++) // the first pass can still be compiling shader variants
            {
                if (RenderPipeline.SupportsRenderRequest(cam, request))
                    RenderPipeline.SubmitRenderRequest(cam, request);
                else
                {
                    cam.targetTexture = rt;
                    cam.Render();
                    cam.targetTexture = null;
                }
            }
            RenderTexture previous = RenderTexture.active;
            RenderTexture.active = rt;
            var tex = new Texture2D(width, height, TextureFormat.RGB24, false);
            tex.ReadPixels(new Rect(0, 0, width, height), 0, 0);
            tex.Apply();
            RenderTexture.active = previous;
            File.WriteAllBytes(path, tex.EncodeToPNG());
            Object.DestroyImmediate(tex);
            rt.Release();
            Object.DestroyImmediate(rt);
        }
    }
}
