plugins {
    base
}

tasks.register("test") {
    group = "verification"
    description = "Runs all backend module tests."
    dependsOn(":backend:domain:test", ":backend:application:test", ":backend:adapters:test", ":backend:server:test")
}

tasks.register("jar") {
    group = "build"
    description = "Builds the backend server runtime jar."
    dependsOn(":backend:server:jar")
}
