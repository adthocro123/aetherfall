using UnityEngine;
using UnityEngine.InputSystem;

namespace Aetherfall.Tools
{
    /// <summary>
    /// A fly-around camera for looking at the world in Play mode: hold the right mouse button to look, WASD to move,
    /// Q / E to go down / up, Shift to go faster, and the scroll wheel to change speed. Uses unscaled time.
    /// </summary>
    [RequireComponent(typeof(Camera))]
    public class FreeFlyCamera : MonoBehaviour
    {
        public float speed = 12f;
        public float fastMultiplier = 4f;
        [Tooltip("Degrees per pixel of mouse movement.")]
        public float lookSensitivity = 0.15f;

        float yaw, pitch;

        void OnEnable()
        {
            Vector3 e = transform.eulerAngles;
            yaw = e.y;
            pitch = e.x > 180f ? e.x - 360f : e.x;
        }

        void OnDisable() => Cursor.lockState = CursorLockMode.None;

        void Update()
        {
            var kb = Keyboard.current;
            var mouse = Mouse.current;
            if (kb == null || mouse == null) return;

            if (mouse.rightButton.isPressed)
            {
                Vector2 d = mouse.delta.ReadValue();
                yaw += d.x * lookSensitivity;
                pitch = Mathf.Clamp(pitch - d.y * lookSensitivity, -89f, 89f);
                transform.rotation = Quaternion.Euler(pitch, yaw, 0f);
                Cursor.lockState = CursorLockMode.Locked;
            }
            else if (Cursor.lockState == CursorLockMode.Locked)
            {
                Cursor.lockState = CursorLockMode.None;
            }

            float scroll = mouse.scroll.ReadValue().y;
            if (scroll != 0f) speed = Mathf.Clamp(speed * (scroll > 0f ? 1.2f : 1f / 1.2f), 1f, 400f);

            Vector3 move = Vector3.zero;
            if (kb.wKey.isPressed) move += Vector3.forward;
            if (kb.sKey.isPressed) move += Vector3.back;
            if (kb.dKey.isPressed) move += Vector3.right;
            if (kb.aKey.isPressed) move += Vector3.left;
            if (kb.eKey.isPressed) move += Vector3.up;
            if (kb.qKey.isPressed) move += Vector3.down;
            if (move == Vector3.zero) return;

            float s = speed * (kb.leftShiftKey.isPressed || kb.rightShiftKey.isPressed ? fastMultiplier : 1f);
            transform.position += transform.TransformDirection(move.normalized) * (s * Time.unscaledDeltaTime);
        }
    }
}
