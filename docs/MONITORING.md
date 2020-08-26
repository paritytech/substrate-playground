backend exposed metrics
nginx

N pod with theia
infra

End user

Each machine can have some process running (e.g. substrate nodes)
Only for end users
Can't see infra level metrics
1 prometheus per user? With grafana

# Infrastructure

kube, docker, backend server
https://docs.docker.com/config/thirdparty/prometheus/

# Theia and users

# Deployed nodes

Substrate exposes prometeus endpoints
https://github.com/paritytech/substrate/pull/4511
https://forum.parity.io/t/metrics-for-reliability-and-performance-monitoring/356


# Resources

https://mxinden.github.io/static/self-service-monitoring.pdf (https://github.com/mxinden/self-service-monitoring-workshop)
https://mxinden.github.io/static/metric-driven-performance-optimization/slides.pdf

# Stackdriver

https://cloud.google.com/stackdriver/pricing

## Monitoring / Probes

* https://console.cloud.google.com/marketplace/details/google/prometheus
* https://prometheus.io/docs/visualization/grafana/
* https://grafana.com/docs/grafana/latest/features/datasources/prometheus/
* https://itnext.io/kubernetes-monitoring-with-prometheus-in-15-minutes-8e54d1de2e13
* https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/
* https://medium.com/@AADota/kubernetes-liveness-and-readiness-probes-difference-1b659c369e17
* https://cloud.google.com/blog/products/gcp/kubernetes-best-practices-setting-up-health-checks-with-readiness-and-liveness-probes
* https://blog.octo.com/liveness-et-readiness-probes-mettez-de-lintelligence-dans-vos-clusters/
* https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#examples

